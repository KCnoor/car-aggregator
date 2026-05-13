-- Additional listings focused on 3 models to demonstrate deal scoring clearly.
-- Run this in the Supabase SQL Editor after seed.sql.

INSERT INTO listings (source, make, model, year, mileage, price, city, color, transmission, fuel_type, body_type, engine_size, seller_type, deal_score, description) VALUES

-- Toyota Camry 2022 — 6 listings, median ~95,000 SAR
-- Scores show clear ranking from urgent bargain to overpriced
('haraj',       'Toyota', 'Camry', 2022, 92000,  74000, 'Riyadh',  'White',  'automatic', 'petrol', 'sedan', '2.5L', 'private', 9.3, 'Urgent sale before travel. Engine perfect, just had full service. Priced well below market.'),
('soum',        'Toyota', 'Camry', 2022, 68000,  83000, 'Jeddah',  'Silver', 'automatic', 'petrol', 'sedan', '2.5L', 'private', 8.1, 'Clean car, no accidents. Moving to Riyadh, prefer quick sale.'),
('sayarah',     'Toyota', 'Camry', 2022, 51000,  92000, 'Dammam',  'Black',  'automatic', 'petrol', 'sedan', '2.5L', 'private', 6.4, 'Well maintained SE trim. Service history available on request.'),
('motory',      'Toyota', 'Camry', 2022, 44000,  98000, 'Riyadh',  'White',  'automatic', 'petrol', 'sedan', '2.5L', 'dealer',  5.5, 'Agency maintained, full service history. Comes with 3-month dealer warranty.'),
('saudi_deals', 'Toyota', 'Camry', 2022, 30000, 107000, 'Jeddah',  'Grey',   'automatic', 'petrol', 'sedan', '2.5L', 'dealer',  4.1, 'Low mileage XSE fully loaded. Panoramic sunroof, JBL, leather.'),
('haraj',       'Toyota', 'Camry', 2022, 22000, 118000, 'Riyadh',  'White',  'automatic', 'petrol', 'sedan', '2.5L', 'dealer',  2.8, 'Brand new condition XSE V6. Full options, still under factory warranty.'),

-- Toyota Corolla 2021 — 5 listings, median ~68,000 SAR
('soum',        'Toyota', 'Corolla', 2021, 78000,  52000, 'Dammam',  'White',  'automatic', 'petrol', 'sedan', '2.0L', 'private', 9.1, 'Higher mileage but meticulously maintained. All original, no paint work.'),
('haraj',       'Toyota', 'Corolla', 2021, 55000,  61000, 'Riyadh',  'Silver', 'automatic', 'petrol', 'sedan', '2.0L', 'private', 7.9, 'Non-smoker, family car. Selling because upgrading. Minor scuff on door.'),
('motory',      'Toyota', 'Corolla', 2021, 41000,  69000, 'Jeddah',  'White',  'automatic', 'petrol', 'sedan', '2.0L', 'dealer',  5.6, 'XLI trim. Agency maintained with full records. Clean inside and out.'),
('sayarah',     'Toyota', 'Corolla', 2021, 28000,  78000, 'Riyadh',  'Black',  'automatic', 'petrol', 'sedan', '2.0L', 'dealer',  3.8, 'Low mileage GLI. Bluetooth, reverse camera. Under dealer warranty.'),
('saudi_deals', 'Toyota', 'Corolla', 2021, 18000,  87000, 'Dammam',  'Red',    'automatic', 'petrol', 'sedan', '2.0L', 'dealer',  2.3, 'Almost new, fully loaded SE trim. Asking price reflects condition and options.'),

-- Nissan Patrol 2022 — 4 listings, median ~200,000 SAR
('haraj',       'Nissan', 'Patrol', 2022, 71000, 165000, 'Jeddah',  'White',  'automatic', 'petrol', 'SUV', '4.0L', 'private', 9.0, 'Relocating abroad, must sell this week. LE trim, 7 seats, no accidents whatsoever.'),
('soum',        'Nissan', 'Patrol', 2022, 48000, 185000, 'Riyadh',  'Black',  'automatic', 'petrol', 'SUV', '4.0L', 'private', 7.2, 'Platinum trim, fully loaded. Garage kept, single owner, clean title.'),
('motory',      'Nissan', 'Patrol', 2022, 31000, 205000, 'Dammam',  'White',  'automatic', 'petrol', 'SUV', '4.0L', 'dealer',  4.6, 'SE trim with sunroof package. Agency maintained, under warranty.'),
('sayarah',     'Nissan', 'Patrol', 2022, 19000, 228000, 'Riyadh',  'Silver', 'automatic', 'petrol', 'SUV', '4.0L', 'dealer',  2.5, 'Nismo edition, limited trim. Rare find, priced to reflect the spec level.');
