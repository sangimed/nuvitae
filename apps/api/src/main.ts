import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const openApiConfig = new DocumentBuilder()
    .setTitle("Nuvitae API")
    .setDescription("REST API bootstrap")
    .setVersion("0.1.0")
    .build();

  SwaggerModule.setup(
    "openapi",
    app,
    SwaggerModule.createDocument(app, openApiConfig),
  );

  const port = Number(process.env.PORT ?? "3001");
  await app.listen(port, process.env.HOST ?? "0.0.0.0");
}

void bootstrap();
