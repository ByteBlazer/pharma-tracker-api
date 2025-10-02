import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global API prefix
  app.setGlobalPrefix("api");

  // Enable CORS only in local environment

  if (process.platform === "win32") {
    app.enableCors();
    console.log(
      "🌐 CORS enabled as we are on Windows,and hence local development"
    );
  }

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Global throttling is configured via APP_GUARD in AppModule
  console.log(
    "🛡️  Global throttling: 500 requests per 1 minute (configured via ThrottlerModule)"
  );

  // Global JWT authentication guard
  const jwtAuthGuard = app.get(JwtAuthGuard);
  app.useGlobalGuards(jwtAuthGuard);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 API Base URL: http://localhost:${port}/api`);
}
bootstrap();
