import { ValidationPipe } from '@nestjs/common';

describe('application bootstrap configuration', () => {
  it('constructs the global validation pipe used by main', () => {
    expect(new ValidationPipe()).toBeInstanceOf(ValidationPipe);
  });
});
