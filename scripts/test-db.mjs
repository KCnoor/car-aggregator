import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://jmfoeziomchpwanuziqm.supabase.co',
  'sb_publishable_FcSNycoXE1cyJxcMM36RSA_EhXoVSmv'
)

const { data, error, count } = await supabase
  .from('listings')
  .select('*', { count: 'exact' })
  .limit(3)

if (error) {
  console.error('Connection failed:', error.message)
} else {
  console.log(`Connected! ${count} listings in database.`)
  console.log('Sample:', data.map(l => `${l.year} ${l.make} ${l.model} — ${l.price.toLocaleString()} SAR (${l.city})`))
}
