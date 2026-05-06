import { NestFactory } from "@nestjs/core"
import { ValidationPipe } from "@nestjs/common"
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix("api/v1")

  app.enableCors({
    origin: [
      process.env.APP_URL ?? "http://localhost:3000",
      process.env.ADMIN_WEB_URL ?? "http://localhost:3001",
    ],
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )

  const swaggerConfig = new DocumentBuilder()
    .setTitle("IntellaBets API")
    .setDescription("Sports analytics and tipster platform API")
    .setVersion("1.0")
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup("api/docs", app, document)

  const port = process.env.PORT ?? 4000
  await app.listen(port)
  console.log(`IntellaBets API running on http://localhost:${port}`)
  console.log(`Swagger docs at http://localhost:${port}/api/docs`)
}

bootstrap()
