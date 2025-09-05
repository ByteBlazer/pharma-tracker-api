import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { ThrottleGuard, ThrottleOptions } from "./guards/throttle.guard";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global API prefix
  app.setGlobalPrefix("api");

  // Enable CORS
  app.enableCors();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Global throttle guard (rate limiting)
  const throttleGuard = app.get(ThrottleGuard);
  // Configure global throttle options
  const globalThrottleOptions: ThrottleOptions = {
    limit: 200, // 100 requests per window
    windowMs: 1 * 60 * 1000, // 1 minute
  };
  throttleGuard.setDefaultOptions(globalThrottleOptions);

  // Verify configuration
  if (!throttleGuard.isConfigured()) {
    console.warn("⚠️  ThrottleGuard is not properly configured!");
  }

  app.useGlobalGuards(throttleGuard);

  console.log(
    `🛡️  Global throttling: ${globalThrottleOptions.limit} requests per ${
      globalThrottleOptions.windowMs / 1000 / 60
    } minutes`
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
