process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.ORACLE_USER = 'SLOW_DATING_TEST';
process.env.ORACLE_PASSWORD = 'SlowDatingTest_2026';
process.env.ORACLE_CONNECT_STRING = 'localhost:1521/XEPDB1';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters';
process.env.OTP_PEPPER = 'test-otp-pepper-at-least-32-characters';
process.env.REFRESH_TOKEN_PEPPER = 'test-refresh-pepper-at-least-32-characters';
