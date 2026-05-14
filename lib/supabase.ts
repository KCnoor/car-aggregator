import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Listing = {
  id:                 string
  source:             string
  source_url:         string | null
  source_id:          string | null
  make_slug:          string | null
  make_en:            string | null
  make_ar:            string | null
  model_slug:         string | null
  model_en:           string | null
  model_ar:           string | null
  year:               number | null
  price_sar:          number | null
  mileage_km:         number | null
  city_slug:          string | null
  city_en:            string | null
  city_ar:            string | null
  color_slug:         string | null
  color_en:           string | null
  color_ar:           string | null
  fuel_type_slug:     string | null
  transmission_slug:  string | null
  body_type_slug:     string | null
  condition:          string | null
  trim:               string | null
  deal_score:         number | null
  deal_score_label:   string | null
  low_price_warning:  boolean
  contact_for_price:  boolean
  is_active:          boolean
  seller_type:        string | null
  title:              string | null
  description_ar:     string | null
  photo_urls:         string[] | null
  scraped_at:         string | null
  created_at:         string
}
