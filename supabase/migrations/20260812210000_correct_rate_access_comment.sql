-- Corrects a name in a column comment. No structural change.
--
-- The original comment said rate access was for "Robert Milligan". There is no
-- Milligan at the company — the person is Robert Mulligan (rmulligan@), who is
-- a different person from Bob Mulligan (bmulligan@). See the roster in
-- CLAUDE.md before assuming which Mulligan is meant.

comment on column profiles.sees_rates is
  'Controls access to employee pay rates, bill rates and labour margin. True for Ryan Beale, Jon Beale and Robert Mulligan (rmulligan@) only. NOT Bob Mulligan (bmulligan@) — different person.';
