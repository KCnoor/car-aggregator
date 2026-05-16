# Data Quality Audit — Pre-Baseline
Generated: 2026-05-16T06:03:04.878Z

Loading all listings…
Total listings: **17287**

Loading seats coverage from raw_listings.structured_data…
  4464 listings have seats in structured_data

## A. Field coverage by source

% of listings per source with a non-null value for each field.

| source | rows | price_sar | make_slug | model_slug | year | mileage_km | city_slug | body_type_slug | seats (from raw) | description_ar | photo_urls | fuel_type_slug | transmission_slug |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| carly | 999 | 999 (100.0%) | 999 (100.0%) | 999 (100.0%) | 999 (100.0%) | 999 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 999 (100.0%) | 0 (0.0%) | 0 (0.0%) |
| carswitch | 328 | 328 (100.0%) | 328 (100.0%) | 328 (100.0%) | 328 (100.0%) | 270 (82.3%) | 328 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 325 (99.1%) | 326 (99.4%) |
| digitalcar | 101 | 101 (100.0%) | 95 (94.1%) | 71 (70.3%) | 101 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 101 (100.0%) | 0 (0.0%) | 0 (0.0%) |
| dubizzle | 920 | 920 (100.0%) | 920 (100.0%) | 920 (100.0%) | 920 (100.0%) | 499 (54.2%) | 920 (100.0%) | 904 (98.3%) | 421 (45.8%) | 920 (100.0%) | 920 (100.0%) | 920 (100.0%) | 920 (100.0%) |
| gogomotor | 1470 | 1470 (100.0%) | 1470 (100.0%) | 1470 (100.0%) | 1470 (100.0%) | 1466 (99.7%) | 1169 (79.5%) | 0 (0.0%) | 0 (0.0%) | 832 (56.6%) | 1470 (100.0%) | 1470 (100.0%) | 139 (9.5%) |
| haraj | 266 | 121 (45.5%) | 264 (99.2%) | 251 (94.4%) | 266 (100.0%) | 222 (83.5%) | 263 (98.9%) | 0 (0.0%) | 0 (0.0%) | 266 (100.0%) | 258 (97.0%) | 105 (39.5%) | 241 (90.6%) |
| motory | 1329 | 1035 (77.9%) | 1286 (96.8%) | 862 (64.9%) | 1324 (99.6%) | 624 (47.0%) | 1281 (96.4%) | 295 (22.2%) | 1282 (96.5%) | 1324 (99.6%) | 1322 (99.5%) | 1213 (91.3%) | 1301 (97.9%) |
| saudisale | 4627 | 4627 (100.0%) | 4627 (100.0%) | 4627 (100.0%) | 4627 (100.0%) | 2844 (61.5%) | 4283 (92.6%) | 3782 (81.7%) | 0 (0.0%) | 0 (0.0%) | 4627 (100.0%) | 4627 (100.0%) | 4557 (98.5%) |
| soum | 687 | 687 (100.0%) | 139 (20.2%) | 557 (81.1%) | 685 (99.7%) | 685 (99.7%) | 0 (0.0%) | 685 (99.7%) | 0 (0.0%) | 0 (0.0%) | 686 (99.9%) | 0 (0.0%) | 0 (0.0%) |
| syarah | 2785 | 2785 (100.0%) | 2785 (100.0%) | 2773 (99.6%) | 2785 (100.0%) | 2016 (72.4%) | 2784 (100.0%) | 1111 (39.9%) | 2752 (98.8%) | 0 (0.0%) | 2785 (100.0%) | 2784 (100.0%) | 2706 (97.2%) |
| yallamotor | 3775 | 3775 (100.0%) | 3775 (100.0%) | 3775 (100.0%) | 3775 (100.0%) | 3773 (99.9%) | 3728 (98.8%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 3775 (100.0%) | 3774 (100.0%) | 2523 (66.8%) |

## B. Outliers and red flags

| check | count | % of total |
|---|---:|---:|
| price_sar < 5,000 (parse error suspect) | 12 | 0.1% |
| price_sar > 3,000,000 (verify legitimacy) | 29 | 0.2% |
| mileage_km < 100 on used car older than 2 yrs (shorthand bug) | 5 | 0.0% |
| mileage_km > 500,000 (high-mileage outlier) | 115 | 0.7% |
| year < 2000 or > 2027 (parse error) | 64 | 0.4% |
| make_slug NULL (can't bucket → unscoreable) | 599 | 3.5% |
| model_slug NULL (can't bucket) | 654 | 3.8% |
| price_sar NULL on active listing | 439 | 2.5% |

Top sources by null-make_slug count:

| source | null make_slug |
|---|---:|
| soum | 548 (79.8%) |
| motory | 43 (3.2%) |
| digitalcar | 6 (5.9%) |
| haraj | 2 (0.8%) |

Sample of price < 5,000 (first 10):
| source | id | year | make/model | price | mileage |
|---|---|---:|---|---:|---:|
| yallamotor | 2101963 | 2000 | toyota/camry | 4000 | 0 |
| dubizzle | monthly-installment-suzuki-desire-2025-ID110667615.html | 2025 | suzuki/dzire | 1020 | 89000 |
| yallamotor | 2101662 | 2023 | toyota/rush | 1000 | 100000 |
| motory | 274723 | 2019 | toyota/camry | 2000 | 120000 |
| yallamotor | 1752173 | 2013 | toyota/corolla | 3000 | 180000 |
| haraj | bb7d57 | 2015 | renault/trafic | 1000 | 232000 |
| haraj | bcf2c7 | 2006 | toyota/camry | 1500 | — |
| motory | 276428 | 2012 | toyota/camry | 2000 | 20000 |
| dubizzle | changan-eado-plus-2025-ID110651775.html | 2025 | changan/eado-plus | 1600 | 13000 |
| dubizzle | ford-territory-2025-2025-ID110666619.html | 2025 | ford/territory | 1460 | — |

## C. Format consistency

### Distinct fuel_type_slug values:
  - `petrol`: 14416
  - `diesel`: 314
  - `hybrid`: 305
  - `electric`: 169
  - `electrical`: 7
  - `mild-hybrid`: 6
  - `plug-in-hybrid`: 1

### Distinct transmission_slug values:
  - `automatic`: 12323
  - `manual`: 342
  - `regional`: 30
  - `tiptronic`: 4
  - `f 1`: 3
  - `and`: 3
  - `2`: 1
  - `with`: 1
  - `dual`: 1
  - `keyless`: 1
  - `black`: 1
  - `makes`: 1
  - `provide`: 1
  - `easy`: 1

### Distinct body_type_slug values:
  - `suv`: 3110
  - `sedan`: 2656
  - `coupe`: 483
  - `minivan`: 163
  - `van`: 146
  - `hatchback`: 123
  - `pickup`: 93
  - `sports`: 3

### Make_slug count by source:

| source | distinct makes | top 3 makes by count |
|---|---:|---|
| carly | 48 | hyundai (168), toyota (144), kia (97) |
| carswitch | 35 | toyota (27), chevrolet (26), suzuki (24) |
| digitalcar | 19 | kia (19), hyundai (17), geely (9) |
| dubizzle | 42 | mercedes-benz (137), bmw (77), lexus (71) |
| gogomotor | 53 | toyota (287), hyundai (175), chevrolet (105) |
| haraj | 22 | toyota (96), hyundai (39), nissan (27) |
| motory | 39 | toyota (273), hyundai (246), kia (171) |
| saudisale | 83 | mercedes-benz (749), land-rover (506), bmw (502) |
| soum | 7 | toyota (62), hyundai (30), nissan (20) |
| syarah | 34 | toyota (664), hyundai (617), kia (327) |
| yallamotor | 56 | toyota (2000), hyundai (247), mercedes-benz (170) |

## D. Cross-source duplicate detection

Grouped by (make_slug, model_slug, year, mileage_5k_bucket, price_2k_bucket). Listings in the same bucket from different sources are likely the same car.

- Total bucket groups: 12766
- Buckets with listings from **2+ sources**: 358 (~1270 listings involved)
- Buckets with listings from **3+ sources**: 28

### Top source pairs that share buckets:

| source pair | shared buckets |
|---|---:|
| saudisale + syarah | 84 |
| dubizzle + saudisale | 58 |
| motory + syarah | 43 |
| carly + syarah | 42 |
| gogomotor + yallamotor | 39 |
| motory + saudisale | 31 |
| dubizzle + yallamotor | 16 |
| dubizzle + syarah | 10 |
| syarah + yallamotor | 9 |
| carly + motory | 8 |
| carly + gogomotor | 8 |
| gogomotor + syarah | 6 |
| dubizzle + motory | 6 |
| carly + saudisale | 6 |
| digitalcar + syarah | 5 |

### Sample 3+-source dupes (first 5):

- **hyundai/accent** 2026 | ~0k km | ~66k SAR
  - saudisale: id=251214 price=66000 mileage=—
  - saudisale: id=249844 price=66125 mileage=—
  - motory: id=274688 price=66250 mileage=—
  - motory: id=268267 price=66000 mileage=—
  - motory: id=274693 price=66250 mileage=—
  - syarah: id=263461 price=66700 mileage=—
  - yallamotor: id=2106125 price=67390 mileage=—
  - syarah: id=294401 price=66700 mileage=—
  - motory: id=274436 price=66250 mileage=—
  - syarah: id=285754 price=66125 mileage=—
  - motory: id=272615 price=66799 mileage=—
  - motory: id=274426 price=66250 mileage=—
  - motory: id=268305 price=66000 mileage=—

- **toyota/yaris** 2026 | ~0k km | ~65k SAR
  - motory: id=267775 price=65900 mileage=—
  - motory: id=270491 price=65900 mileage=—
  - syarah: id=271959 price=65550 mileage=—
  - motory: id=267852 price=65900 mileage=—
  - motory: id=270493 price=65900 mileage=—
  - motory: id=270504 price=65900 mileage=—
  - motory: id=267798 price=65900 mileage=—
  - motory: id=267786 price=65900 mileage=—
  - motory: id=270499 price=65900 mileage=—
  - motory: id=270878 price=65900 mileage=—
  - motory: id=267800 price=65900 mileage=—
  - motory: id=267802 price=65900 mileage=—
  - motory: id=268674 price=65900 mileage=—
  - motory: id=267796 price=65900 mileage=—
  - motory: id=267764 price=65900 mileage=—
  - motory: id=270876 price=65900 mileage=—
  - motory: id=267794 price=65900 mileage=—
  - motory: id=267784 price=65900 mileage=—
  - saudisale: id=236599 price=65800 mileage=—
  - motory: id=270501 price=65900 mileage=—
  - motory: id=267804 price=65900 mileage=—
  - motory: id=270483 price=65900 mileage=—
  - motory: id=267777 price=65900 mileage=—
  - motory: id=270506 price=65900 mileage=—
  - motory: id=268672 price=65900 mileage=—
  - motory: id=275122 price=65550 mileage=—
  - motory: id=270485 price=65900 mileage=—
  - motory: id=270882 price=65900 mileage=—
  - motory: id=269011 price=65900 mileage=—
  - motory: id=269315 price=65900 mileage=—
  - motory: id=274197 price=64400 mileage=—
  - motory: id=270495 price=65900 mileage=—
  - motory: id=269310 price=65900 mileage=—
  - motory: id=270497 price=65900 mileage=—
  - motory: id=267807 price=65900 mileage=—
  - motory: id=267782 price=65900 mileage=—
  - motory: id=273881 price=65900 mileage=—
  - motory: id=268670 price=65900 mileage=—
  - motory: id=267792 price=65900 mileage=—
  - motory: id=267779 price=65900 mileage=—
  - motory: id=267773 price=65900 mileage=—

- **hyundai/accent** 2026 | ~0k km | ~69k SAR
  - motory: id=276773 price=69500 mileage=—
  - syarah: id=294402 price=69920 mileage=—
  - saudisale: id=245478 price=68000 mileage=—
  - saudisale: id=245477 price=68000 mileage=—
  - syarah: id=268421 price=68425 mileage=—
  - saudisale: id=243306 price=68300 mileage=—
  - motory: id=269575 price=68425 mileage=—
  - saudisale: id=242837 price=68500 mileage=—
  - saudisale: id=245446 price=68000 mileage=—
  - motory: id=273358 price=68655 mileage=—
  - syarah: id=272216 price=69345 mileage=—
  - saudisale: id=238381 price=69000 mileage=—
  - syarah: id=268384 price=69575 mileage=—

- **ford/taurus** 2026 | ~0k km | ~127k SAR
  - saudisale: id=243575 price=127500 mileage=—
  - syarah: id=269181 price=127650 mileage=—
  - saudisale: id=243208 price=126000 mileage=—
  - dubizzle: id=ford-taurus-2026-ID110657027.html price=126119 mileage=—

- **toyota/camry** 2025 | ~0k km | ~128k SAR
  - syarah: id=211523 price=128800 mileage=—
  - saudisale: id=238633 price=129000 mileage=—
  - saudisale: id=238835 price=129000 mileage=—
  - motory: id=258684 price=128000 mileage=—

## E. Intra-source duplicate detection

Two checks per source: (1) repeat source_id (hard dupe), (2) listings within same source that match on (make, model, year, mileage_5k, price_2k) ⇒ likely duplicated upload.

| source | rows | repeat source_id | intra-bucket dupes (groups > 1) | dupe rate |
|---|---:|---:|---:|---:|
| carly | 999 | 0 | 152 | 21.7% |
| carswitch | 328 | 0 | 0 | 0.0% |
| digitalcar | 101 | 0 | 4 | 4.0% |
| dubizzle | 920 | 0 | 81 | 14.5% |
| gogomotor | 1470 | 0 | 59 | 4.3% |
| haraj | 266 | 0 | 0 | 0.0% |
| motory | 1329 | 0 | 65 | 13.6% |
| saudisale | 4627 | 0 | 415 | 18.6% |
| soum | 687 | 0 | 16 | 3.9% |
| syarah | 2785 | 0 | 278 | 17.8% |
| yallamotor | 3775 | 0 | 522 | 20.0% |

## F. Source bias check

Top 5 (make, model, year) combinations: median price by source.

### toyota/yaris 2023 (109 listings)

| source | n | median | p25 | p75 |
|---|---:|---:|---:|---:|
| syarah | 42 | 45,200 | 43,500 | 49,000 |
| soum | 17 | 45,955 | 45,955 | 47,502 |
| yallamotor | 14 | 52,000 | 44,500 | 52,000 |
| motory | 13 | 46,000 | 44,678 | 49,500 |
| carly | 10 | 50,366 | 49,178 | 50,366 |
| gogomotor | 9 | 49,440 | 48,057 | 55,000 |
| dubizzle | 2 | 47,500 | 39,500 | 47,500 |
| saudisale | 1 | 45,000 | 45,000 | 45,000 |
| carswitch | 1 | 60,500 | 60,500 | 60,500 |

### toyota/yaris 2026 (96 listings)

| source | n | median | p25 | p75 |
|---|---:|---:|---:|---:|
| motory | 42 | 65,900 | 65,900 | 65,900 |
| syarah | 32 | 67,275 | 66,000 | 70,150 |
| saudisale | 13 | 62,000 | 61,800 | 66,500 |
| carly | 7 | 68,520 | 67,650 | 70,610 |
| yallamotor | 1 | 64,515 | 64,515 | 64,515 |
| gogomotor | 1 | 65,256 | 65,256 | 65,256 |

### hyundai/accent 2026 (93 listings)

| source | n | median | p25 | p75 |
|---|---:|---:|---:|---:|
| motory | 42 | 64,500 | 64,500 | 66,000 |
| syarah | 22 | 66,700 | 64,400 | 70,150 |
| saudisale | 17 | 68,000 | 64,000 | 69,000 |
| carly | 7 | 69,446 | 68,280 | 73,610 |
| gogomotor | 3 | 53,000 | 52,530 | 54,075 |
| yallamotor | 1 | 67,390 | 67,390 | 67,390 |
| digitalcar | 1 | 77,680 | 77,680 | 77,680 |

### toyota/corolla 2024 (89 listings)

| source | n | median | p25 | p75 |
|---|---:|---:|---:|---:|
| syarah | 39 | 55,500 | 53,600 | 65,000 |
| motory | 31 | 58,000 | 56,700 | 63,000 |
| gogomotor | 7 | 66,950 | 50,000 | 73,000 |
| yallamotor | 6 | 63,000 | 58,000 | 72,000 |
| carswitch | 2 | 82,300 | 61,000 | 82,300 |
| soum | 2 | 68,485 | 62,343 | 68,485 |
| saudisale | 1 | 248,000 | 248,000 | 248,000 |
| carly | 1 | 85,473 | 85,473 | 85,473 |

### hyundai/accent 2024 (83 listings)

| source | n | median | p25 | p75 |
|---|---:|---:|---:|---:|
| syarah | 69 | 43,700 | 42,600 | 46,500 |
| motory | 6 | 48,500 | 46,500 | 51,000 |
| carly | 4 | 54,606 | 44,006 | 55,666 |
| saudisale | 2 | 67,400 | 67,375 | 67,400 |
| gogomotor | 1 | 53,560 | 53,560 | 53,560 |
| yallamotor | 1 | 46,000 | 46,000 | 46,000 |

### land-rover/defender 2025 (79 listings)

| source | n | median | p25 | p75 |
|---|---:|---:|---:|---:|
| saudisale | 74 | 359,500 | 336,500 | 397,999 |
| dubizzle | 5 | 384,000 | 289,000 | 415,000 |

### ford/taurus 2026 (78 listings)

| source | n | median | p25 | p75 |
|---|---:|---:|---:|---:|
| saudisale | 33 | 136,000 | 128,000 | 144,000 |
| syarah | 16 | 142,600 | 140,875 | 148,925 |
| carly | 11 | 148,368 | 125,926 | 156,414 |
| dubizzle | 9 | 128,900 | 120,900 | 144,900 |
| motory | 8 | 139,725 | 123,050 | 142,025 |
| digitalcar | 1 | 150,820 | 150,820 | 150,820 |

### bmw/7-series 2026 (78 listings)

| source | n | median | p25 | p75 |
|---|---:|---:|---:|---:|
| saudisale | 76 | 468,000 | 449,000 | 490,000 |
| syarah | 2 | 490,000 | 475,000 | 490,000 |
