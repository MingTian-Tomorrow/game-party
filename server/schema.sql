CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, username text UNIQUE NOT NULL, nickname text NOT NULL,
 password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
 id text PRIMARY KEY, host_id text NOT NULL REFERENCES users(id), title text NOT NULL,
 venue text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 capacity integer NOT NULL CHECK(capacity BETWEEN 2 AND 48), level text NOT NULL,
 fee text NOT NULL, notes text NOT NULL DEFAULT '', cancelled boolean NOT NULL DEFAULT false,
 CHECK(ends_at > starts_at)
);
CREATE TABLE IF NOT EXISTS registrations (
 game_id text NOT NULL REFERENCES games(id), user_id text NOT NULL REFERENCES users(id),
 status text NOT NULL CHECK(status IN ('joined','waiting','left')),
 attendance text NOT NULL DEFAULT 'unknown' CHECK(attendance IN ('unknown','present','reported_absent','absent')),
 joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(game_id,user_id)
);
CREATE TABLE IF NOT EXISTS reviews (
 game_id text NOT NULL REFERENCES games(id), author_id text NOT NULL REFERENCES users(id),
 target_id text NOT NULL REFERENCES users(id), skill integer CHECK(skill BETWEEN 1 AND 5),
 spirit integer CHECK(spirit BETWEEN 1 AND 5), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(game_id,author_id,target_id), CHECK(author_id <> target_id), CHECK(skill IS NOT NULL OR spirit IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS issues (
 id text PRIMARY KEY, game_id text NOT NULL REFERENCES games(id), user_id text NOT NULL REFERENCES users(id),
 reason text NOT NULL, resolved boolean NOT NULL DEFAULT false, resolution text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_log (
 id text PRIMARY KEY, actor_id text NOT NULL REFERENCES users(id), game_id text REFERENCES games(id),
 target_id text REFERENCES users(id), action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_time ON games(starts_at);
CREATE INDEX IF NOT EXISTS registrations_user ON registrations(user_id);
CREATE INDEX IF NOT EXISTS review_target ON reviews(target_id);
