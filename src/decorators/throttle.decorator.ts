import { SetMetadata } from '@nestjs/common';
import { ThrottleOptions } from '../guards/throttle.guard';

export const THROTTLE_KEY = 'throttle';
export const Throttle = (options: ThrottleOptions) => SetMetadata(THROTTLE_KEY, options);
