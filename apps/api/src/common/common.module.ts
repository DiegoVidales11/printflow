import { Global, Module } from '@nestjs/common';
import { MongoService } from './mongo.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, MongoService],
  exports: [PrismaService, MongoService],
})
export class CommonModule {}
