-- High-Performance TikTok Performance Data Table
-- Handles ~1M rows per month with fast query performance

CREATE TABLE IF NOT EXISTS tiktok_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text NOT NULL,
  month int NOT NULL,
  year int NOT NULL,
  gmv numeric DEFAULT 0,
  views int DEFAULT 0,
  orders int DEFAULT 0,
  air_date timestamp,
  creator_name text,
  creator_id text,
  imported_at timestamp DEFAULT now(),
  
  -- Prevent duplicate imports for same video in same month
  CONSTRAINT unique_video_month UNIQUE (video_id, month, year)
);

-- Performance indexes for fast joins and filtering
CREATE INDEX IF NOT EXISTS idx_tiktok_perf_video ON tiktok_performance(video_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_perf_month_year ON tiktok_performance(month, year);
CREATE INDEX IF NOT EXISTS idx_tiktok_perf_air_date ON tiktok_performance(air_date);

-- Enable Row Level Security (RLS)
ALTER TABLE tiktok_performance ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users
CREATE POLICY "Allow all for authenticated users" ON tiktok_performance
  FOR ALL
  USING (auth.role() = 'authenticated');
