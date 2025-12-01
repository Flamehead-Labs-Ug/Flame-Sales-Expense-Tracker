-- This script updates all existing users to have an 'active' status.
-- It should be run once to correct the data for users created before the 'status' column was added.

UPDATE users
SET status = 'active'
WHERE status IS NULL;
