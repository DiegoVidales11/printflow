/** @type {import('next').NextConfig} */
const nextConfig = {
  // Genera un servidor mínimo para la imagen Docker
  output: 'standalone',
  // En Kubernetes el Ingress manda /api directo a la API.
  // En desarrollo local (npm run dev) este rewrite hace lo mismo.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_INTERNAL_URL || 'http://localhost:3000'}/:path*` }];
  },
};

module.exports = nextConfig;
