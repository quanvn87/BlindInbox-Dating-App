CREATE TABLE profiles (
  user_id VARCHAR2(36) PRIMARY KEY,
  display_name NVARCHAR2(50) NOT NULL,
  birth_date DATE NOT NULL,
  gender_identity_code VARCHAR2(30) NOT NULL,
  gender_label NVARCHAR2(50) NULL,
  height_cm NUMBER(3) NULL,
  hometown_location_code VARCHAR2(50) NULL,
  home_location_code VARCHAR2(50) NOT NULL,
  bio NVARCHAR2(500) NULL,
  favorite_song_title CLOB NULL,
  favorite_song_artist CLOB NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT (SYSTIMESTAMP AT TIME ZONE 'UTC') NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT (SYSTIMESTAMP AT TIME ZONE 'UTC') NOT NULL,
  CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT fk_profile_gender FOREIGN KEY (gender_identity_code) REFERENCES gender_catalog(code),
  CONSTRAINT fk_profile_hometown FOREIGN KEY (hometown_location_code) REFERENCES location_nodes(code),
  CONSTRAINT fk_profile_home FOREIGN KEY (home_location_code) REFERENCES location_nodes(code),
  CONSTRAINT ck_profile_height CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 250),
  CONSTRAINT ck_profile_gender_label CHECK (
    (gender_identity_code = 'SELF_DESCRIBED' AND gender_label IS NOT NULL) OR
    (gender_identity_code <> 'SELF_DESCRIBED' AND gender_label IS NULL)
  ),
  CONSTRAINT ck_profile_song_pair CHECK (
    (favorite_song_title IS NULL AND favorite_song_artist IS NULL) OR
    (favorite_song_title IS NOT NULL AND favorite_song_artist IS NOT NULL)
  )
)
-- statement
CREATE TABLE profile_interested_genders (
  user_id VARCHAR2(36) NOT NULL,
  gender_code VARCHAR2(30) NOT NULL,
  CONSTRAINT pk_profile_interested_gender PRIMARY KEY (user_id, gender_code),
  CONSTRAINT fk_profile_interest_user FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_interest_gender FOREIGN KEY (gender_code) REFERENCES gender_catalog(code)
)
-- statement
CREATE TABLE profile_connection_intents (
  user_id VARCHAR2(36) NOT NULL,
  intent_code VARCHAR2(40) NOT NULL,
  CONSTRAINT pk_profile_connection_intent PRIMARY KEY (user_id, intent_code),
  CONSTRAINT fk_profile_intent_user FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_intent_code FOREIGN KEY (intent_code) REFERENCES connection_intent_catalog(code)
)
-- statement
CREATE TABLE profile_prompt_answers (
  user_id VARCHAR2(36) NOT NULL,
  prompt_code VARCHAR2(50) NOT NULL,
  answer NVARCHAR2(280) NOT NULL,
  CONSTRAINT pk_profile_prompt_answer PRIMARY KEY (user_id, prompt_code),
  CONSTRAINT fk_profile_answer_user FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_answer_prompt FOREIGN KEY (prompt_code) REFERENCES profile_prompts(code)
)
