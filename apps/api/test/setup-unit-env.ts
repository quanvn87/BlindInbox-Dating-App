process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.ORACLE_USER = 'unit-tests';
process.env.ORACLE_PASSWORD = 'unit-tests';
process.env.ORACLE_CONNECT_STRING = 'unit-tests.invalid:1521/XEPDB1';
process.env.JWT_ACCESS_SECRET = 'unit-access-secret-at-least-32-characters';
process.env.OTP_PEPPER = 'unit-otp-pepper-at-least-32-characters';
process.env.REFRESH_TOKEN_PEPPER = 'unit-refresh-pepper-at-least-32-characters';
