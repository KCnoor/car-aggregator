import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Listing = {
  id: string
  source: string
  source_url: string | null
  make: string
  model: string
  year: number
  mileage: number | null
  price: number
  city: string
  condition: string
  color: string | null
  transmission: string
  fuel_type: string
  body_type: string | null
  engine_size: string | null
  seller_type: string
  description: string | null
  deal_score: number | null
  created_at: string
}
