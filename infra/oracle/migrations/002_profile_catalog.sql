CREATE TABLE gender_catalog (
  code VARCHAR2(30) PRIMARY KEY,
  display_name NVARCHAR2(80) NOT NULL,
  is_active NUMBER(1) DEFAULT 1 NOT NULL,
  sort_order NUMBER(3) NOT NULL,
  CONSTRAINT ck_gender_catalog_active CHECK (is_active IN (0, 1)),
  CONSTRAINT uq_gender_catalog_sort UNIQUE (sort_order)
)
-- statement
INSERT ALL
  INTO gender_catalog (code, display_name, is_active, sort_order) VALUES ('MAN', N'Nam', 1, 1)
  INTO gender_catalog (code, display_name, is_active, sort_order) VALUES ('WOMAN', N'Nữ', 1, 2)
  INTO gender_catalog (code, display_name, is_active, sort_order) VALUES ('NON_BINARY', N'Phi nhị nguyên', 1, 3)
  INTO gender_catalog (code, display_name, is_active, sort_order) VALUES ('SELF_DESCRIBED', N'Tự mô tả', 1, 4)
SELECT 1 FROM dual
-- statement
CREATE TABLE connection_intent_catalog (
  code VARCHAR2(40) PRIMARY KEY,
  display_name NVARCHAR2(100) NOT NULL,
  is_active NUMBER(1) DEFAULT 1 NOT NULL,
  sort_order NUMBER(3) NOT NULL,
  CONSTRAINT ck_intent_catalog_active CHECK (is_active IN (0, 1)),
  CONSTRAINT uq_intent_catalog_sort UNIQUE (sort_order)
)
-- statement
INSERT ALL
  INTO connection_intent_catalog (code, display_name, is_active, sort_order) VALUES ('CASUAL_CONVERSATION', N'Tìm người nói chuyện', 1, 1)
  INTO connection_intent_catalog (code, display_name, is_active, sort_order) VALUES ('FRIENDSHIP', N'Tìm bạn bè', 1, 2)
  INTO connection_intent_catalog (code, display_name, is_active, sort_order) VALUES ('LONG_TERM_DATING', N'Hẹn hò lâu dài', 1, 3)
  INTO connection_intent_catalog (code, display_name, is_active, sort_order) VALUES ('SHORT_TERM_DATING', N'Hẹn hò ngắn hạn', 1, 4)
  INTO connection_intent_catalog (code, display_name, is_active, sort_order) VALUES ('OPEN_TO_EXPLORE', N'Muốn tìm hiểu', 1, 5)
SELECT 1 FROM dual
-- statement
CREATE TABLE location_nodes (
  code VARCHAR2(50) PRIMARY KEY,
  display_name NVARCHAR2(120) NOT NULL,
  location_level VARCHAR2(20) NOT NULL,
  parent_code VARCHAR2(50) NULL,
  is_active NUMBER(1) DEFAULT 1 NOT NULL,
  CONSTRAINT fk_location_parent FOREIGN KEY (parent_code) REFERENCES location_nodes(code),
  CONSTRAINT ck_location_level CHECK (location_level IN ('PROVINCE', 'DISTRICT', 'WARD')),
  CONSTRAINT ck_location_active CHECK (is_active IN (0, 1)),
  CONSTRAINT ck_location_parent_level CHECK (
    (location_level = 'PROVINCE' AND parent_code IS NULL) OR
    (location_level IN ('DISTRICT', 'WARD') AND parent_code IS NOT NULL)
  )
)
-- statement
INSERT ALL
  INTO location_nodes (code, display_name, location_level, parent_code, is_active) VALUES ('VN-HCM', N'Thành phố Hồ Chí Minh', 'PROVINCE', NULL, 1)
  INTO location_nodes (code, display_name, location_level, parent_code, is_active) VALUES ('VN-HN', N'Thành phố Hà Nội', 'PROVINCE', NULL, 1)
SELECT 1 FROM dual
-- statement
INSERT INTO location_nodes (code, display_name, location_level, parent_code, is_active)
VALUES ('VN-HCM-Q1', N'Quận 1', 'DISTRICT', 'VN-HCM', 1)
-- statement
INSERT INTO location_nodes (code, display_name, location_level, parent_code, is_active)
VALUES ('VN-HCM-Q1-BT', N'Phường Bến Thành', 'WARD', 'VN-HCM-Q1', 1)
-- statement
CREATE TABLE profile_prompts (
  code VARCHAR2(50) PRIMARY KEY,
  prompt_text NVARCHAR2(280) NOT NULL,
  is_active NUMBER(1) DEFAULT 1 NOT NULL,
  sort_order NUMBER(3) NOT NULL,
  CONSTRAINT ck_profile_prompt_active CHECK (is_active IN (0, 1)),
  CONSTRAINT uq_profile_prompt_sort UNIQUE (sort_order)
)
-- statement
INSERT ALL
  INTO profile_prompts (code, prompt_text, is_active, sort_order) VALUES ('IDEAL_SUNDAY', N'Ngày Chủ nhật lý tưởng của tôi là…', 1, 1)
  INTO profile_prompts (code, prompt_text, is_active, sort_order) VALUES ('RECENT_JOY', N'Điều gần đây khiến tôi vui là…', 1, 2)
  INTO profile_prompts (code, prompt_text, is_active, sort_order) VALUES ('SOMETHING_I_VALUE', N'Điều tôi trân trọng là…', 1, 3)
SELECT 1 FROM dual
