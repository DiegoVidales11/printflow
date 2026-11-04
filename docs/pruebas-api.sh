#!/usr/bin/env bash
# Pruebas de evidencia de PrintFlow (P1 a P4 del reporte) contra la API real.
# Uso:  bash docs/pruebas-api.sh printflow.192.168.100.62.nip.io
# Requiere: curl y python3 (vienen en Ubuntu).
set -u
HOST="${1:-printflow.192.168.100.62.nip.io}"
API="https://$HOST/api"
C="curl -sk"

json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
titulo() { printf '\n\033[1;36m==== %s ====\033[0m\n' "$1"; }
resultado() { # $1 = código obtenido, $2 = esperado, $3 = cuerpo
  if [ "$1" = "$2" ]; then printf '\033[1;32mOK\033[0m  HTTP %s (esperado %s)\n' "$1" "$2"
  else printf '\033[1;31mREVISAR\033[0m  HTTP %s (esperado %s)\n' "$1" "$2"; fi
  echo "    $(echo "$3" | head -c 220)"
}
login() {
  $C -X POST "$API/auth/login" -H 'Content-Type: application/json' \
     -d "{\"email\":\"$1\",\"password\":\"$2\"}" | json "d['token']"
}
# peticion METODO RUTA TOKEN [JSON] -> imprime "codigo|cuerpo"
peticion() {
  local salida
  salida=$($C -w '\n%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' ${4:+-d "$4"})
  echo "$(echo "$salida" | tail -n1)|$(echo "$salida" | sed '$d')"
}

titulo "Inicio de sesión de los 3 roles"
T_ADMIN=$(login admin@printflow.mx Admin12345)
T_OPER=$(login operador1@printflow.mx Operador12345)
T_CLI=$(login cliente1@correo.mx Cliente12345)
[ -n "$T_ADMIN" ] && [ -n "$T_OPER" ] && [ -n "$T_CLI" ] && echo "Tokens JWT obtenidos para admin, operador y cliente" || { echo "No se pudo iniciar sesión"; exit 1; }

# Datos de apoyo
MAT_PLA=$($C "$API/materiales" -H "Authorization: Bearer $T_ADMIN" | json "[m['id'] for m in d if m['tipo']=='PLA' and m['color']=='Negro'][0]")
MAT_RES=$($C "$API/materiales" -H "Authorization: Bearer $T_ADMIN" | json "[m['id'] for m in d if m['tipo']=='RESINA'][0]")
IMP_FDM=$($C "$API/impresoras?limit=100" -H "Authorization: Bearer $T_ADMIN" | json "[i['id'] for i in d['data'] if i['tipo']=='FDM' and i['activa'] and i['nombre'].startswith('Prusa')][0]")
SUFIJO=$(date +%H%M%S)
BOB=$($C -X POST "$API/bobinas" -H "Authorization: Bearer $T_ADMIN" -H 'Content-Type: application/json' \
      -d "{\"codigo\":\"BOB-PRUEBA-$SUFIJO\",\"materialId\":$MAT_PLA,\"gramosDisponibles\":100}" | json "d['id']")
BOB_RES=$($C -X POST "$API/bobinas" -H "Authorization: Bearer $T_ADMIN" -H 'Content-Type: application/json' \
      -d "{\"codigo\":\"BOB-PRUEBA-RES-$SUFIJO\",\"materialId\":$MAT_RES,\"gramosDisponibles\":500}" | json "d['id']")
nuevo_pedido() {
  $C -X POST "$API/pedidos" -H "Authorization: Bearer $T_CLI" -H 'Content-Type: application/json' \
     -d "{\"archivoStl\":\"prueba-$1.stl\",\"materialTipo\":\"$1\",\"color\":\"Negro\",\"cantidad\":2,\"dimX\":30,\"dimY\":30,\"dimZ\":30}" | json "d['id']"
}
P_A=$(nuevo_pedido PLA); P_B=$(nuevo_pedido PLA); P_R=$(nuevo_pedido RESINA)
echo "Bobina de prueba BOB-PRUEBA-$SUFIJO con 100 g · pedidos de prueba $P_A, $P_B (PLA) y $P_R (resina)"

titulo "P1 · Autorización por rol: un CLIENTE intenta cotizar"
R=$(peticion POST "/pedidos/$P_A/cotizar" "$T_CLI" "{\"gramosPorPieza\":30,\"horasPorPieza\":1,\"impresoraId\":$IMP_FDM,\"bobinaId\":$BOB}")
resultado "${R%%|*}" 403 "${R#*|}"

titulo "P4 · RN-3 Compatibilidad: pedido de RESINA en impresora FDM"
R=$(peticion POST "/pedidos/$P_R/cotizar" "$T_OPER" "{\"gramosPorPieza\":20,\"horasPorPieza\":1,\"impresoraId\":$IMP_FDM,\"bobinaId\":$BOB_RES}")
resultado "${R%%|*}" 409 "${R#*|}"

titulo "Preparación: el operador cotiza los dos pedidos PLA (30 g × 2 piezas → reserva 66 g cada uno)"
for P in $P_A $P_B; do
  R=$(peticion POST "/pedidos/$P/cotizar" "$T_OPER" "{\"gramosPorPieza\":30,\"horasPorPieza\":1,\"impresoraId\":$IMP_FDM,\"bobinaId\":$BOB}")
  echo "  Pedido $P cotizado: HTTP ${R%%|*}"
done

titulo "P3 · RN-2 Concurrencia: el cliente aprueba los dos pedidos AL MISMO TIEMPO (la bobina solo tiene 100 g)"
TMP=$(mktemp -d)
peticion PATCH "/pedidos/$P_A/estado" "$T_CLI" '{"estado":"APROBADO"}' > "$TMP/a" &
peticion PATCH "/pedidos/$P_B/estado" "$T_CLI" '{"estado":"APROBADO"}' > "$TMP/b" &
wait
CA=$(cut -d'|' -f1 "$TMP/a"); CB=$(cut -d'|' -f1 "$TMP/b")
echo "  Pedido $P_A → HTTP $CA"; echo "  Pedido $P_B → HTTP $CB"
if { [ "$CA" = 200 ] && [ "$CB" = 409 ]; } || { [ "$CA" = 409 ] && [ "$CB" = 200 ]; }; then
  printf '\033[1;32mOK\033[0m  Solo uno reservó material; el otro recibió 409 (SELECT ... FOR UPDATE)\n'
else
  printf '\033[1;31mREVISAR\033[0m  Se esperaba un 200 y un 409\n'
fi
grep -h "RN-2" "$TMP/a" "$TMP/b" | cut -d'|' -f2 | head -c 220; echo
APROBADO=$([ "$CA" = 200 ] && echo "$P_A" || echo "$P_B")

titulo "P2 · RN-1 Anticipo: el operador intenta poner en cola sin anticipo"
R=$(peticion PATCH "/pedidos/$APROBADO/estado" "$T_OPER" '{"estado":"EN_COLA"}')
resultado "${R%%|*}" 409 "${R#*|}"

titulo "Extra · Transición inválida: SOLICITADO → ENTREGADO"
P_X=$(nuevo_pedido PLA)
R=$(peticion PATCH "/pedidos/$P_X/estado" "$T_ADMIN" '{"estado":"ENTREGADO"}')
resultado "${R%%|*}" 409 "${R#*|}"

rm -rf "$TMP"
echo
echo "Listo. Toma captura de esta salida como evidencia de P1 a P4."
