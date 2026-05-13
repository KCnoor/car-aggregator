-- Run this second in the Supabase SQL editor, after schema.sql

INSERT INTO listings (source, make, model, year, mileage, price, city, color, transmission, fuel_type, body_type, engine_size, seller_type, deal_score, description) VALUES

-- Toyota Corolla
('sayarah',  'Toyota', 'Corolla', 2020, 85000,  59000, 'Riyadh',  'White',  'automatic', 'petrol', 'sedan', '2.0L', 'private', 7.8, 'Well maintained, single owner, all service records available. Minor scratch on rear bumper.'),
('soum',     'Toyota', 'Corolla', 2020, 42000,  74000, 'Jeddah',  'Silver', 'automatic', 'petrol', 'sedan', '2.0L', 'dealer',  4.2, 'Excellent condition, low mileage. Full agency service history.'),
('haraj',    'Toyota', 'Corolla', 2022, 28000,  82000, 'Dammam',  'Black',  'automatic', 'petrol', 'sedan', '2.0L', 'private', 6.1, 'Almost new, bought 2022. Selling due to travel.'),

-- Toyota Camry
('motory',      'Toyota', 'Camry', 2021, 62000,  87000, 'Riyadh',  'White',  'automatic', 'petrol', 'sedan', '2.5L', 'private', 8.2, 'Camry SE in perfect condition. Non-smoker car, no accidents.'),
('sayarah',     'Toyota', 'Camry', 2022, 31000, 108000, 'Jeddah',  'Grey',   'automatic', 'petrol', 'sedan', '2.5L', 'dealer',  5.4, 'Camry XSE, leather seats, sunroof. Agency maintained.'),
('saudi_deals', 'Toyota', 'Camry', 2019, 95000,  72000, 'Dammam',  'Beige',  'automatic', 'petrol', 'sedan', '2.5L', 'private', 7.1, 'Good condition for the year, 4 new tyres installed recently.'),

-- Toyota Land Cruiser
('sayarah', 'Toyota', 'Land Cruiser', 2021, 68000, 262000, 'Riyadh', 'White', 'automatic', 'petrol', 'SUV', '4.0L', 'private', 6.8, 'GXR trim, 7-seater, perfect family car. Garage kept.'),
('motory',  'Toyota', 'Land Cruiser', 2020, 88000, 238000, 'Jeddah', 'Black', 'automatic', 'petrol', 'SUV', '4.0L', 'dealer',  5.9, 'VXR fully loaded, panoramic roof, JBL sound. Minor service due.'),

-- Toyota Prado
('soum',  'Toyota', 'Prado', 2020, 91000, 141000, 'Riyadh',  'White',  'automatic', 'petrol', 'SUV', '4.0L', 'private', 7.4, 'TXL trim, 7 seats, 3rd row foldable. All original, no modifications.'),
('haraj', 'Toyota', 'Prado', 2022, 24000, 178000, 'Dammam',  'Silver', 'automatic', 'petrol', 'SUV', '4.0L', 'dealer',  5.2, 'Brand new condition, still under warranty. Full options.'),

-- Nissan Patrol
('sayarah',     'Nissan', 'Patrol', 2021, 54000, 174000, 'Riyadh', 'White', 'automatic', 'petrol', 'SUV', '4.0L', 'private', 7.6, 'LE Platinum trim, fully loaded. No accidents, original paint throughout.'),
('saudi_deals', 'Nissan', 'Patrol', 2020, 82000, 148000, 'Jeddah', 'Black', 'automatic', 'petrol', 'SUV', '4.0L', 'private', 8.6, 'Priced to sell quickly, relocating abroad. Urgent sale, negotiable.'),

-- Nissan Altima
('soum',   'Nissan', 'Altima', 2020, 66000, 57000, 'Dammam', 'White',  'automatic', 'petrol', 'sedan', '2.5L', 'private', 7.2, 'Clean car, no accidents. New battery and tyres installed.'),
('motory', 'Nissan', 'Altima', 2021, 38000, 71000, 'Riyadh', 'Silver', 'automatic', 'petrol', 'sedan', '2.5L', 'dealer',  4.8, 'Showroom condition, SV trim. Agency maintained with full records.'),

-- Hyundai Sonata
('saudi_deals', 'Hyundai', 'Sonata', 2021, 57000, 67000, 'Jeddah',  'White', 'automatic', 'petrol', 'sedan', '2.5L', 'private', 7.3, 'Very clean, non-smoker. Selling because upgrading to SUV.'),
('sayarah',     'Hyundai', 'Elantra', 2022, 29000, 62000, 'Riyadh',  'Blue',  'automatic', 'petrol', 'sedan', '2.0L', 'private', 6.7, 'Smart Sense trim with safety features. Barely used.'),
('haraj',       'Hyundai', 'Tucson', 2021, 46000, 83000, 'Dammam', 'Grey',  'automatic', 'petrol', 'SUV',   '2.0L', 'dealer',  6.2, 'Full option Tucson. Panoramic sunroof, wireless charging.'),

-- Kia
('motory',  'Kia', 'Sportage', 2022, 33000, 77000, 'Riyadh', 'White', 'automatic', 'petrol', 'SUV',   '2.0L', 'dealer',  7.1, 'EX trim, all options. Under dealer warranty until 2025.'),
('sayarah', 'Kia', 'K5',       2021, 51000, 71000, 'Jeddah', 'Red',   'automatic', 'petrol', 'sedan', '1.6L', 'private', 6.6, 'Sporty K5 GT-Line. Excellent condition, no modifications.'),

-- GMC
('soum',        'GMC', 'Yukon',    2021, 59000, 196000, 'Riyadh', 'White', 'automatic', 'petrol', 'SUV', '5.3L', 'private', 7.7, 'SLT fully loaded, 8 seats. Perfect for large families, no issues.'),
('saudi_deals', 'GMC', 'Suburban', 2020, 77000, 184000, 'Dammam', 'Black', 'automatic', 'petrol', 'SUV', '5.3L', 'dealer',  6.4, 'Premier trim, rear entertainment, leather throughout.'),

-- Mercedes-Benz
('motory',  'Mercedes-Benz', 'C200', 2022, 32000, 167000, 'Riyadh', 'Black',  'automatic', 'petrol', 'sedan', '1.5L', 'dealer',  7.5, 'AMG Line, panoramic, burmester sound. Under warranty.'),
('sayarah', 'Mercedes-Benz', 'E300', 2021, 47000, 193000, 'Jeddah', 'Silver', 'automatic', 'petrol', 'sedan', '2.0L', 'private', 6.1, 'Avantgarde trim, full options. Service history with Al-Jazirah Motors.'),

-- BMW
('haraj',       'BMW', '520i', 2021, 52000, 163000, 'Riyadh',  'White', 'automatic', 'petrol', 'sedan', '2.0L', 'dealer',  7.2, 'M Sport package, 19-inch wheels, HUD display. Excellent condition.'),
('saudi_deals', 'BMW', '320i', 2022, 27000, 143000, 'Dammam',  'Grey',  'automatic', 'petrol', 'sedan', '2.0L', 'private', 6.8, 'Almost new, only 27k km. All options, sunroof, live cockpit.'),

-- Honda
('soum',   'Honda', 'Civic',  2022, 36000, 67000, 'Jeddah',  'White', 'automatic', 'petrol', 'sedan', '1.5L', 'private', 7.0, 'Sport trim, turbo engine, Honda Sensing safety suite. Clean car.'),
('motory', 'Honda', 'Accord', 2021, 44000, 84000, 'Riyadh',  'Black', 'automatic', 'petrol', 'sedan', '1.5L', 'dealer',  6.5, 'Touring trim, full leather, wireless Apple CarPlay. Agency maintained.'),

-- Ford
('haraj', 'Ford', 'Explorer', 2020, 71000, 131000, 'Dammam', 'White', 'automatic', 'petrol', 'SUV', '2.3L', 'private', 7.6, 'XLT trim, 7-seater, no accidents. Very well maintained family car.');
