# Phase A Validation Report
Generated: 2026-05-15T08:40:28.863Z

Loading listings…
  2813 active listings

## 1. Wreck case discovery

Query: listings with old deal_score >= 9.0 AND description matches any wreck pattern, ordered by old score DESC, mileage DESC.

Found 1 candidates.
⚠ Anchor case found but NOT in wreck candidates: id=6fef4a97-d28a-43f4-a8aa-0b1baabb1cb9, old_score=5, new_score=5, flags=["airbag_deployed","side_impact","engine_overhauled","expired_or_no_insurance","very_high_mileage"]

   description excerpt: Peace be upon you, Tahoe 2008. It has side impacts. The car is not considered totaled. The car's mileage is 790,000+ km. The differential is new, the suspension is new. The car was overhauled, but I d…

### Top 6 wreck cases (worst-offender)

| # | id | source | yr/make/model | price | mile_km | old | new | red_flags | desc excerpt |
|---|---|---|---|---:|---:|---:|---:|---|---|
| 1 | 6a665df1 | haraj | 1999 Toyota/Corolla | 5,000 | 0 | 9.4 | **5** | deceased_owner | Peace, mercy, and blessings of God be upon you. I have a Toyota Corolla model 19… |

**Gate: all wreck cases must score ≤ 5.0** — ✓ PASS

## 2. Distribution histogram (deal_score_v2 vs deal_score)

| bucket | v1 count | v1 % | v2 count | v2 % |
|---|---:|---:|---:|---:|
| 10.0 | 18 | 0.7% | 12 | 0.5% |
| 9.0–10.0 | 73 | 2.8% | 36 | 1.4% |
| 8.0–9.0 | 138 | 5.3% | 132 | 5.1% |
| 7.0–8.0 | 213 | 8.2% | 204 | 7.9% |
| 6.0–7.0 | 907 | 35.0% | 883 | 34.1% |
| 5.0–6.0 | 938 | 36.2% | 996 | 38.4% |
| 4.0–5.0 | 153 | 5.9% | 175 | 6.8% |
| 3.0–4.0 | 46 | 1.8% | 51 | 2.0% |
| 2.0–3.0 | 46 | 1.8% | 45 | 1.7% |
| 1.0–2.0 | 25 | 1.0% | 23 | 0.9% |
| 0.0–1.0 | 34 | 1.3% | 34 | 1.3% |
| null | 222 | — | 222 | — |

Top tier ≥9.0: v1 91 (3.5%) → v2 48 (1.9%)
**Gate: top tier ≥9.0 < 10% (v2)** — ✓ PASS

## 3. Non-wreck control (5 random clean Syarah listings)

| id | yr/make/model | price | old | new |
|---|---|---:|---:|---:|
| 7d00a146 | 2018 Dodge/Charger | 80,500 | 7.2 | **7.2** |
| b3903936 | 2023 Ford/Taurus | 79,300 | 5.9 | **5.9** |
| 0527dbef | 2021 Dodge/Durango | 81,500 | 7.4 | **7.4** |
| fb5f3a0b | 2027 Haval/Changan Eado | 82,225 | 5.9 | **5.9** |
| a5c0f123 | 2023 Audi/Q3 | 77,600 | 8 | **8** |

**Gate: clean Syarah controls stay in 6.5–9.5** — ✗ FAIL (some scored outside the expected band)

## 4. Old vs new comparison (100 random listings)

Sample size: 100
Mean delta (v2 - v1): -0.16

First 15 rows:

| id | source | yr/make/model | old | new | delta |
|---|---|---|---:|---:|---:|
| be4312f4 | saudisale | 2026 BMW/5 Series | 5.1 | 4.9 | -0.2 |
| 6c59fb54 | soum | 2022 Toyota/Land Cruiser | 6.8 | 6.8 | 0.0 |
| 1c9f18f7 | carly | 2026 Kia/K5 | 6.9 | 6.9 | 0.0 |
| 075ba466 | carly | 2023 Peugeot/E-208 | 6.2 | 3.4 | -2.8 |
| 0c51c59c | carly | 2023 Ford/Bronco | 5.8 | 5.8 | 0.0 |
| 29dbdf4f | soum | 2023 Toyota/Yaris | 6 | 5.2 | -0.8 |
| 2c372d3f | gogomotor | 2013 Ford/EXPLORER | 7.2 | 7.2 | 0.0 |
| 3f443261 | carly | 2025 Honda/Pilot | 4.7 | 4.7 | 0.0 |
| 21d6e48c | gogomotor | 2015 Volkswagen/TIGUAN | 6.2 | 6.2 | 0.0 |
| 28de6b5d | gogomotor | 2006 Honda/Accord | 4.8 | 4.8 | 0.0 |
| 0b6f88ae | haraj | 2021 Hyundai/Renault Symbol | 5 | 5 | 0.0 |
| 3c350156 | haraj | 2023 Hyundai/Elantra | 6.4 | 6.4 | 0.0 |
| 05846ae1 | motory | 2020 Mazda/Mazda 6 | 9.1 | 6.6 | -2.5 |
| 3b7150ed | syarah | 2021 Hyundai/Elantra | 6.4 | 6.4 | 0.0 |
| 3b85ab54 | syarah | 2022 Mercedes/GLE | 7 | 7 | 0.0 |

## 5. Worst movers — top 20 increases and top 20 decreases

### Top 20 score INCREASES (expect: clean cars whose comps were dragged down by spam)

| id | source | yr/make/model | price | old | new | Δ | red_flags | desc |
|---|---|---|---:|---:|---:|---:|---|---|
| 276f7116 | motory | 2012 BMW/5 Series | 175,000 | 0 | **4.7** | +4.7 | — | سيارة بي إم دبليو الفئة الخامسة 2012 مستعملة للبيع بناقل حركة أوتوماتيك لون أسود… |
| 03b0f164 | saudisale | 2026 Dongfeng/Shine | 45,500 | 5.6 | **9.3** | +3.7 | — |  |
| 26005d20 | motory | 2011 Honda/Odyssey | 32,000 | 0 | **3.6** | +3.6 | — | سيارة هوندا اوديسي 2011 مستعملة للبيع بناقل حركة أوتوماتيك لون بيج. اشتري الآن ا… |
| 53003420 | motory | 2025 Ford/Territory | 118,335 | 1.9 | **5.5** | +3.6 | — | سيارة فورد تيريتوري 2025 جديدة للبيع بناقل حركة أوتوماتيك لون رمادي. اشتري الآن … |
| a14ad067 | motory | 2025 Ford/Territory | 118,450 | 1.9 | **5.5** | +3.6 | — | سيارة فورد تيريتوري 2025 جديدة للبيع بناقل حركة أوتوماتيك لون أسود. اشتري الآن ا… |
| 870a8940 | motory | 2016 Dodge/Durango | 56,000 | 2.4 | **5.9** | +3.5 | — | سيارة دودج دورانجو 2016 مستعملة للبيع بناقل حركة أوتوماتيك لون أبيض لؤلؤي. اشتري… |
| 916f0048 | motory | 2025 Ford/Territory | 124,545 | 1.3 | **4.8** | +3.5 | — | سيارة فورد تيريتوري 2025 جديدة للبيع بناقل حركة أوتوماتيك لون أسود. اشتري الآن ا… |
| 4f05fe11 | carly | 2025 Honda/Odyssey | 191,277 | 5.1 | **8.3** | +3.2 | — |  |
| c5540714 | motory | 2020 Mercedes/BMW 4 Series Coupe | 190,000 | 3.4 | **6.6** | +3.2 | — | سيارة مرسيدس E كوبيه 2020 مستعملة للبيع بناقل حركة أوتوماتيك لون رمادي. اشتري ال… |
| 02745d66 | syarah | 2022 GMC/Yukon | 180,000 | 2.4 | **5.5** | +3.1 | — |  |
| 5ae832c0 | motory | 2016 Mazda/Mazda 6 | 55,000 | 1.7 | **4.8** | +3.1 | — | سيارة مازدا 6 2016 مستعملة للبيع بناقل حركة أوتوماتيك لون فضي. اشتري الآن اونلاي… |
| bb8a4232 | saudisale | 2025 Lexus/ES | 239,000 | 2.5 | **5.5** | +3.0 | — |  |
| 7d2c7db6 | saudisale | 2025 Lexus/ES | 248,500 | 2.1 | **5** | +2.9 | — |  |
| 9235e9d9 | saudisale | 2025 Lexus/ES | 248,500 | 2.1 | **5** | +2.9 | — |  |
| 92d1ce27 | saudisale | 2025 Lexus/ES | 238,000 | 2.6 | **5.5** | +2.9 | — |  |
| e6861180 | motory | 2025 Lexus/ES | 242,190 | 2.4 | **5.3** | +2.9 | — | سيارة لكزس ES 2025 جديدة للبيع بناقل حركة أوتوماتيك لون تيتانيوم. اشتري الآن اون… |
| 24c76995 | motory | 2025 Ford/Territory | 91,080 | 5.6 | **8.4** | +2.8 | — | سيارة فورد تيريتوري 2025 جديدة للبيع بناقل حركة أوتوماتيك لون أبيض. اشتري الآن ا… |
| a79bcc03 | saudisale | 2025 Lexus/ES | 269,000 | 1 | **3.8** | +2.8 | — |  |
| 04c0dfba | yallamotor | 2021 Chevrolet/Blazer | 110,000 | 3.3 | **6** | +2.7 | — |  |
| 1d8cd709 | gogomotor | 2025 Ford/Territory | 94,000 | 5.6 | **8.2** | +2.6 | — |  |

### Top 20 score DECREASES (expect: red-flag cars previously missed)

| id | source | yr/make/model | price | old | new | Δ | red_flags | desc |
|---|---|---|---:|---:|---:|---:|---|---|
| 69acd542 | motory | 2021 Jeep/Grand Cherokee | 131,000 | 5.9 | **0** | -5.9 | — | سيارة جيب جراند شيروكي 2021 مستعملة للبيع بناقل حركة أوتوماتيك لون رمادي. اشتري … |
| 14a6a5c1 | motory | 2023 Jeep/Grand Cherokee | 195,000 | 7 | **1.4** | -5.6 | — | سيارة جيب جراند شيروكي 2023 مستعملة للبيع بناقل حركة أوتوماتيك لون أبيض لؤلؤي. ا… |
| a99a13be | motory | 2013 Hyundai/Azera | 24,000 | 9.8 | **4.3** | -5.5 | — | سيارة هيونداي أزيرا 2013 مستعملة للبيع بناقل حركة أوتوماتيك لون أبيض. اشتري الآن… |
| 41909e63 | carly | 2023 Haval/Jolion | 80,046 | 5.8 | **0.5** | -5.3 | — |  |
| 80145982 | motory | 2012 Volvo/Volvo V60 | 31,500 | 9 | **3.8** | -5.2 | — | سيارة فولفو V60 2012 مستعملة للبيع بناقل حركة أوتوماتيك لون فضي. اشتري الآن اونل… |
| 5b59d335 | motory | 2026 Nissan/X-Trail | 131,900 | 6.7 | **1.7** | -5.0 | — | سيارة نيسان إكس-تريل 2026 جديدة للبيع بناقل حركة CVT لون أبيض. اشتري الآن اونلاي… |
| 923a142f | motory | 2026 Nissan/X-Trail | 133,400 | 6.5 | **1.6** | -4.9 | — | سيارة نيسان إكس-تريل 2026 جديدة للبيع بناقل حركة CVT لون ذهبي. اشتري الآن اونلاي… |
| f2787a47 | motory | 2013 Ford/Edge | 40,000 | 7 | **2.3** | -4.7 | — | سيارة فورد ايدج 2013 مستعملة للبيع بناقل حركة أوتوماتيك لون أحمر. اشتري الآن اون… |
| 5f642929 | soum | 2021 Nissan/Altima | 73,605 | 6.8 | **2.1** | -4.7 | — |  |
| 5a68645f | motory | 2012 Dodge/Durango | 30,000 | 9.2 | **4.6** | -4.6 | — | سيارة دودج دورانجو 2012 مستعملة للبيع بناقل حركة أوتوماتيك لون أبيض. اشتري الآن … |
| 6a665df1 | haraj | 1999 Toyota/Corolla | 5,000 | 9.4 | **5** | -4.4 | deceased_owner | Peace, mercy, and blessings of God be upon you. I have a Toyota Corolla model 19… |
| 102801d1 | syarah | 2022 Land Rover/Range Rover | 195,000 | 9.1 | **4.8** | -4.3 | — |  |
| 1a5be91b | motory | 2023 Toyota/Yaris | 50,000 | 8.1 | **3.8** | -4.3 | — | سيارة تويوتا يارس 2023 مستعملة للبيع بناقل حركة أوتوماتيك لون أبيض. اشتري الآن ا… |
| 5ce544e6 | motory | 2023 Toyota/Yaris | 50,000 | 8.1 | **3.8** | -4.3 | — | سيارة تويوتا يارس 2023 مستعملة للبيع بناقل حركة عادي لون أبيض. اشتري الآن اونلاي… |
| 6b4c3d13 | syarah | 2021 Jeep/Grand Cherokee | 91,800 | 7.2 | **3** | -4.2 | — |  |
| 8cc3d0f1 | saudisale | 2026 Nissan/X-Trail | 107,500 | 8.7 | **4.7** | -4.0 | — |  |
| a352763d | saudisale | 2026 Nissan/X-Trail | 107,500 | 8.7 | **4.7** | -4.0 | — |  |
| 068384e4 | saudisale | 2026 Nissan/X-Trail | 107,000 | 8.7 | **4.8** | -3.9 | — |  |
| b5ccbdb0 | saudisale | 2026 Nissan/X-Trail | 107,000 | 8.7 | **4.8** | -3.9 | — |  |
| 79990bc8 | carly | 2023 Hyundai/Tucson | 104,480 | 5.9 | **2.1** | -3.8 | — |  |

## 6. Baseline coverage

price_baselines rows: 27

Top makes by baseline count:

| make | baselines |
|---|---:|
| nissan | 4 |
| chevrolet | 3 |
| toyota | 3 |
| jeep | 3 |
| gmc | 2 |
| hyundai | 2 |
| lexus | 2 |
| bmw | 2 |
| mercedes-benz | 2 |
| kia | 1 |
| ford | 1 |
| haval | 1 |
| mg | 1 |

## 7. Cost / scoring source summary

| score_source_v2 | count |
|---|---:|
| unscored | 222 |
| ai_valuation | 2380 |
| baseline_statistical | 211 |

See full cost report from score.js run: API calls 103, file-cache hits 2278, hit rate 95.7%, total spend $0.16.

## Phase A gate summary

| check | result |
|---|---|
| Wreck cases score ≤ 5.0 | ✓ PASS |
| Top tier ≥9.0 < 10% | ✓ PASS |
| Clean controls in 6.5–9.5 | ✗ FAIL |

Total time: 4.6s