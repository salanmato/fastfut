#!/usr/bin/env python3
"""
ETL Pipeline for Football Manager — Premier League 2026/27.

Fetches real data from:
  1. EA FC 27 Player Ratings (Kaggle: dahipoomjj/ea-fc-27-player-ratings-and-detailed-in-game-stats)
  2. Premier League 2026/27 Season (Kaggle: dataenthusiast007/2026-27-premier-league-season)
  3. FIFA World Cup 2026 Referees (Kaggle: mominullptr/fifa-world-cup-2026-dataset)
  4. Transfermarkt Players (dcaribou/transfermarkt-datasets R2 bucket)

Outputs:
  - data/fm2627.sqlite
  - public/data/fm2627.json
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import os
import re
import sqlite3
import time
import unicodedata
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT_DIR / "data" / "raw"
SQLITE_PATH = ROOT_DIR / "data" / "fm2627.sqlite"
JSON_PATH = ROOT_DIR / "public" / "data" / "fm2627.json"

KAGGLE_URLS = {
    "fc27": "https://www.kaggle.com/api/v1/datasets/download/dahipoomjj/ea-fc-27-player-ratings-and-detailed-in-game-stats",
    "pl2627": "https://www.kaggle.com/api/v1/datasets/download/dataenthusiast007/2026-27-premier-league-season",
    "wc26": "https://www.kaggle.com/api/v1/datasets/download/mominullptr/fifa-world-cup-2026-dataset",
}
TM_PLAYERS_URL = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/players.csv.gz"

# Map EA FC 27 club names -> Official Premier League 2026/27 team names
FC27_TO_PL_CLUB = {
    "Arsenal": "Arsenal",
    "Aston Villa": "Aston Villa",
    "AFC Bournemouth": "AFC Bournemouth",
    "Brentford": "Brentford",
    "Brighton": "Brighton & Hove Albion",
    "Chelsea": "Chelsea",
    "Coventry City": "Coventry City",
    "Crystal Palace": "Crystal Palace",
    "Everton": "Everton",
    "Fulham": "Fulham",
    "Hull City": "Hull City",
    "Ipswich": "Ipswich Town",
    "Leeds United": "Leeds United",
    "Liverpool": "Liverpool",
    "Manchester City": "Manchester City",
    "Man Utd": "Manchester United",
    "Newcastle Utd": "Newcastle United",
    "Nott'm Forest": "Nottingham Forest",
    "Sunderland": "Sunderland",
    "Spurs": "Tottenham Hotspur",
}

MARKET_LEAGUES = {
    "LALIGA EA SPORTS",
    "Serie A Enilive",
    "Bundesliga",
    "Ligue 1 McDonald's",
    "Eredivisie",
    "Liga Portugal",
    "ROSHN Saudi League",
    "Major League Soccer",
    "Liga Profesional de Fútbol",
    "Trendyol Süper Lig",
}

# Canonical EFL clubs across Championship (24), League One (16), League Two (4)
# Tuple fields: (fc27_name, canonical_name, short, division, tier, primary, secondary, budgetM, tm_id, stadium, city, capacity, founded, stadium_img)
EFL_CLUBS: list[dict[str, Any]] = [
    # --- EFL Championship (24 clubs, tier 2) ---
    {"fc27": "West Ham", "name": "West Ham United", "short": "WHU", "division": "EFL Championship", "tier": 2, "primary": "#7A263A", "secondary": "#1BB1E7", "budgetM": 42, "tm": 379, "stadium": "London Stadium", "city": "London", "capacity": 62500, "founded": 1895, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/34/London_Olympic_Stadium_West_Ham.jpg/1280px-London_Olympic_Stadium_West_Ham.jpg"},
    {"fc27": "Wolves", "name": "Wolverhampton Wanderers", "short": "WOL", "division": "EFL Championship", "tier": 2, "primary": "#FDB913", "secondary": "#231F20", "budgetM": 38, "tm": 543, "stadium": "Molineux Stadium", "city": "Wolverhampton", "capacity": 31750, "founded": 1877, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/MolineuxStadium2022.jpg/1280px-MolineuxStadium2022.jpg"},
    {"fc27": "Burnley", "name": "Burnley", "short": "BUR", "division": "EFL Championship", "tier": 2, "primary": "#6C1D45", "secondary": "#99D6EA", "budgetM": 30, "tm": 1132, "stadium": "Turf Moor", "city": "Burnley", "capacity": 21944, "founded": 1882, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f0/Turf_Moor_-_Harry_Potts_Way_%28east%29.jpg/1280px-Turf_Moor_-_Harry_Potts_Way_%28east%29.jpg"},
    {"fc27": "Middlesbrough", "name": "Middlesbrough", "short": "MID", "division": "EFL Championship", "tier": 2, "primary": "#E11B22", "secondary": "#FFFFFF", "budgetM": 26, "tm": 641, "stadium": "Riverside Stadium", "city": "Middlesbrough", "capacity": 34742, "founded": 1876, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8c/Middlesbrough_riverside_stadium.jpg/1280px-Middlesbrough_riverside_stadium.jpg"},
    {"fc27": "Southampton", "name": "Southampton", "short": "SOU", "division": "EFL Championship", "tier": 2, "primary": "#D71920", "secondary": "#FFFFFF", "budgetM": 34, "tm": 180, "stadium": "St Mary's Stadium", "city": "Southampton", "capacity": 32384, "founded": 1885, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b2/St_Mary%27s_Stadium_%28cropped%29.jpg/1280px-St_Mary%27s_Stadium_%28cropped%29.jpg"},
    {"fc27": "Sheffield Utd", "name": "Sheffield United", "short": "SHU", "division": "EFL Championship", "tier": 2, "primary": "#EE2737", "secondary": "#111111", "budgetM": 25, "tm": 350, "stadium": "Bramall Lane", "city": "Sheffield", "capacity": 32050, "founded": 1889, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/12/2023_08_02_arne_mueseler_00138-Verbessert-RR_%2853106208941%29.jpg/1280px-2023_08_02_arne_mueseler_00138-Verbessert-RR_%2853106208941%29.jpg"},
    {"fc27": "Norwich", "name": "Norwich City", "short": "NOR", "division": "EFL Championship", "tier": 2, "primary": "#FFF200", "secondary": "#00A650", "budgetM": 20, "tm": 1123, "stadium": "Carrow Road", "city": "Norwich", "capacity": 27359, "founded": 1902, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/2015-05-16_-11_-_Carrow_Road%2C_Norwich.JPG/1280px-2015-05-16_-11_-_Carrow_Road%2C_Norwich.JPG"},
    {"fc27": "Wrexham", "name": "Wrexham", "short": "WRE", "division": "EFL Championship", "tier": 2, "primary": "#E41B17", "secondary": "#FFFFFF", "budgetM": 24, "tm": 1112, "stadium": "STōK Cae Ras", "city": "Wrexham", "capacity": 13341, "founded": 1864, "img": "https://upload.wikimedia.org/wikipedia/commons/d/d2/The_Racecourse_Ground%2C_Wrexham_%28geograph_6141572%29.jpg"},
    {"fc27": "Birmingham City", "name": "Birmingham City", "short": "BIR", "division": "EFL Championship", "tier": 2, "primary": "#0047AB", "secondary": "#FFFFFF", "budgetM": 24, "tm": 337, "stadium": "St. Andrew's", "city": "Birmingham", "capacity": 29409, "founded": 1875, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6f/TiltonRoadEnd01.JPG/1280px-TiltonRoadEnd01.JPG"},
    {"fc27": "Derby County", "name": "Derby County", "short": "DER", "division": "EFL Championship", "tier": 2, "primary": "#FFFFFF", "secondary": "#111111", "budgetM": 16, "tm": 22, "stadium": "Pride Park Stadium", "city": "Derby", "capacity": 32956, "founded": 1884, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/26/2023_08_02_arne_mueseler_00196-Verbessert-RR_%2853106400184%29.jpg/1280px-2023_08_02_arne_mueseler_00196-Verbessert-RR_%2853106400184%29.jpg"},
    {"fc27": "Swansea City", "name": "Swansea City", "short": "SWA", "division": "EFL Championship", "tier": 2, "primary": "#FFFFFF", "secondary": "#111111", "budgetM": 15, "tm": 2288, "stadium": "Swansea.com Stadium", "city": "Swansea", "capacity": 21088, "founded": 1912, "img": "https://upload.wikimedia.org/wikipedia/commons/6/68/New_Morfa_Stadium_-_geograph.org.uk_-_32243.jpg"},
    {"fc27": "Watford", "name": "Watford", "short": "WAT", "division": "EFL Championship", "tier": 2, "primary": "#FBEE23", "secondary": "#ED2127", "budgetM": 18, "tm": 1010, "stadium": "Vicarage Road", "city": "Watford", "capacity": 22200, "founded": 1881, "img": "https://upload.wikimedia.org/wikipedia/commons/1/16/Vicarage_Road_2015.jpg"},
    {"fc27": "QPR", "name": "Queens Park Rangers", "short": "QPR", "division": "EFL Championship", "tier": 2, "primary": "#1D5BA4", "secondary": "#FFFFFF", "budgetM": 14, "tm": 1039, "stadium": "Loftus Road", "city": "London", "capacity": 18439, "founded": 1882, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/62/Loftus_Road_Stadium_25_April_2025.jpg/1280px-Loftus_Road_Stadium_25_April_2025.jpg"},
    {"fc27": "Millwall", "name": "Millwall", "short": "MIL", "division": "EFL Championship", "tier": 2, "primary": "#001D5E", "secondary": "#FFFFFF", "budgetM": 14, "tm": 1028, "stadium": "The Den", "city": "London", "capacity": 20146, "founded": 1885, "img": "https://upload.wikimedia.org/wikipedia/commons/5/52/The_New_Den_-_geograph.org.uk_-_1143517.jpg"},
    {"fc27": "West Brom", "name": "West Bromwich Albion", "short": "WBA", "division": "EFL Championship", "tier": 2, "primary": "#122F67", "secondary": "#FFFFFF", "budgetM": 18, "tm": 984, "stadium": "The Hawthorns", "city": "West Bromwich", "capacity": 26850, "founded": 1878, "img": ""},
    {"fc27": "Blackburn Rovers", "name": "Blackburn Rovers", "short": "BLB", "division": "EFL Championship", "tier": 2, "primary": "#009EE0", "secondary": "#FFFFFF", "budgetM": 14, "tm": 164, "stadium": "Ewood Park", "city": "Blackburn", "capacity": 31367, "founded": 1875, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/Ewood_Park_2011.jpg/1280px-Ewood_Park_2011.jpg"},
    {"fc27": "Bristol City", "name": "Bristol City", "short": "BRC", "division": "EFL Championship", "tier": 2, "primary": "#E21836", "secondary": "#FFFFFF", "budgetM": 15, "tm": 698, "stadium": "Ashton Gate", "city": "Bristol", "capacity": 27000, "founded": 1894, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/Ashton_Gate_-_Lansdown_Stand.jpg/1280px-Ashton_Gate_-_Lansdown_Stand.jpg"},
    {"fc27": "Preston", "name": "Preston North End", "short": "PNE", "division": "EFL Championship", "tier": 2, "primary": "#FFFFFF", "secondary": "#002B5C", "budgetM": 12, "tm": 466, "stadium": "Deepdale", "city": "Preston", "capacity": 23408, "founded": 1880, "img": "https://upload.wikimedia.org/wikipedia/commons/2/23/Deepdalecomplete.jpg"},
    {"fc27": "Portsmouth", "name": "Portsmouth", "short": "POR", "division": "EFL Championship", "tier": 2, "primary": "#001489", "secondary": "#FFFFFF", "budgetM": 13, "tm": 1020, "stadium": "Fratton Park", "city": "Portsmouth", "capacity": 20899, "founded": 1898, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5d/Fratton_Park.jpg/1280px-Fratton_Park.jpg"},
    {"fc27": "Stoke City", "name": "Stoke City", "short": "STK", "division": "EFL Championship", "tier": 2, "primary": "#E03A3E", "secondary": "#FFFFFF", "budgetM": 16, "tm": 512, "stadium": "bet365 Stadium", "city": "Stoke-on-Trent", "capacity": 30089, "founded": 1863, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/Aerial_view_of_Bet_365_Stadium.jpg/1280px-Aerial_view_of_Bet_365_Stadium.jpg"},
    {"fc27": "Charlton Ath", "name": "Charlton Athletic", "short": "CHA", "division": "EFL Championship", "tier": 2, "primary": "#D4021D", "secondary": "#FFFFFF", "budgetM": 11, "tm": 358, "stadium": "The Valley", "city": "London", "capacity": 27111, "founded": 1905, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/84/Charlton_Athletic_football_ground.jpg/1280px-Charlton_Athletic_football_ground.jpg"},
    {"fc27": "Bolton", "name": "Bolton Wanderers", "short": "BOL", "division": "EFL Championship", "tier": 2, "primary": "#FFFFFF", "secondary": "#1C2C5B", "budgetM": 11, "tm": 355, "stadium": "Toughsheet Community Stadium", "city": "Bolton", "capacity": 28723, "founded": 1874, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f1/Bolton_macron_wanderers_stadium.jpg/1280px-Bolton_macron_wanderers_stadium.jpg"},
    {"fc27": "Cardiff City", "name": "Cardiff City", "short": "CAR", "division": "EFL Championship", "tier": 2, "primary": "#0070B5", "secondary": "#FFFFFF", "budgetM": 13, "tm": 603, "stadium": "Cardiff City Stadium", "city": "Cardiff", "capacity": 33280, "founded": 1899, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/Cardiff_City_Stadium_Pitch.jpg/1280px-Cardiff_City_Stadium_Pitch.jpg"},
    {"fc27": "Lincoln City", "name": "Lincoln City", "short": "LIN", "division": "EFL Championship", "tier": 2, "primary": "#E0001B", "secondary": "#FFFFFF", "budgetM": 8, "tm": 1198, "stadium": "LNER Stadium", "city": "Lincoln", "capacity": 10780, "founded": 1884, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3d/Lincoln_v_Boston_002.jpg/1280px-Lincoln_v_Boston_002.jpg"},
    # --- EFL League One (16 clubs, tier 3) ---
    {"fc27": "Leicester City", "name": "Leicester City", "short": "LEI", "division": "EFL League One", "tier": 3, "primary": "#003090", "secondary": "#FDBE11", "budgetM": 14, "tm": 1003, "stadium": "King Power Stadium", "city": "Leicester", "capacity": 32262, "founded": 1884, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/Leicester_city_king_power_stadium.jpg/1280px-Leicester_city_king_power_stadium.jpg"},
    {"fc27": "Luton Town", "name": "Luton Town", "short": "LUT", "division": "EFL League One", "tier": 3, "primary": "#F78F1E", "secondary": "#002D62", "budgetM": 9, "tm": 1031, "stadium": "Kenilworth Road", "city": "Luton", "capacity": 12056, "founded": 1885, "img": "https://upload.wikimedia.org/wikipedia/commons/e/e2/Luton_Town_FC_-_geograph.org.uk_-_1407783.jpg"},
    {"fc27": "Sheffield Wed", "name": "Sheffield Wednesday", "short": "SHW", "division": "EFL League One", "tier": 3, "primary": "#0066B3", "secondary": "#FFFFFF", "budgetM": 8, "tm": 1035, "stadium": "Hillsborough Stadium", "city": "Sheffield", "capacity": 34835, "founded": 1867, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b7/Sheffield_wednesday_hillsborough_stadium.jpg/1280px-Sheffield_wednesday_hillsborough_stadium.jpg"},
    {"fc27": "Oxford United", "name": "Oxford United", "short": "OXF", "division": "EFL League One", "tier": 3, "primary": "#FDE100", "secondary": "#002147", "budgetM": 7, "tm": 988, "stadium": "Kassam Stadium", "city": "Oxford", "capacity": 12500, "founded": 1893, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/The_Kassam_Stadium_-_geograph.org.uk_-_6961557.jpg/1280px-The_Kassam_Stadium_-_geograph.org.uk_-_6961557.jpg"},
    {"fc27": "Huddersfield", "name": "Huddersfield Town", "short": "HUD", "division": "EFL League One", "tier": 3, "primary": "#0E63AD", "secondary": "#FFFFFF", "budgetM": 7, "tm": 1110, "stadium": "John Smith's Stadium", "city": "Huddersfield", "capacity": 24121, "founded": 1908, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Huddersfield_the-john-smiths-stadium.jpg/1280px-Huddersfield_the-john-smiths-stadium.jpg"},
    {"fc27": "Reading", "name": "Reading", "short": "REA", "division": "EFL League One", "tier": 3, "primary": "#004494", "secondary": "#FFFFFF", "budgetM": 6, "tm": 1032, "stadium": "Select Car Leasing Stadium", "city": "Reading", "capacity": 24161, "founded": 1871, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/70/Select_Car_Leasing.jpg/1280px-Select_Car_Leasing.jpg"},
    {"fc27": "Blackpool", "name": "Blackpool", "short": "BLA", "division": "EFL League One", "tier": 3, "primary": "#F68712", "secondary": "#FFFFFF", "budgetM": 6, "tm": 1181, "stadium": "Bloomfield Road", "city": "Blackpool", "capacity": 16616, "founded": 1887, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/The_Armfield_South_Stand_at_Bloomfield_Road_-_geograph.org.uk_-_6245667.jpg/1280px-The_Armfield_South_Stand_at_Bloomfield_Road_-_geograph.org.uk_-_6245667.jpg"},
    {"fc27": "MK Dons", "name": "MK Dons", "short": "MKD", "division": "EFL League One", "tier": 3, "primary": "#FFFFFF", "secondary": "#111111", "budgetM": 6, "tm": 991, "stadium": "Stadium MK", "city": "Milton Keynes", "capacity": 30500, "founded": 2004, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/31/Stadium_MK.jpg/1280px-Stadium_MK.jpg"},
    {"fc27": "Leyton Orient", "name": "Leyton Orient", "short": "LEY", "division": "EFL League One", "tier": 3, "primary": "#D91920", "secondary": "#FFFFFF", "budgetM": 5, "tm": 1150, "stadium": "Brisbane Road", "city": "London", "capacity": 9271, "founded": 1881, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/80/Brisbane_Road.jpg/1280px-Brisbane_Road.jpg"},
    {"fc27": "Bradford City", "name": "Bradford City", "short": "BRA", "division": "EFL League One", "tier": 3, "primary": "#7A1230", "secondary": "#F5A623", "budgetM": 5, "tm": 1027, "stadium": "Valley Parade", "city": "Bradford", "capacity": 24840, "founded": 1903, "img": ""},
    {"fc27": "Stockport", "name": "Stockport County", "short": "STO", "division": "EFL League One", "tier": 3, "primary": "#004B9B", "secondary": "#FFFFFF", "budgetM": 6, "tm": 1098, "stadium": "Edgeley Park", "city": "Stockport", "capacity": 10852, "founded": 1883, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ce/Edgeley_park_2021.jpg/1280px-Edgeley_park_2021.jpg"},
    {"fc27": "Wycombe", "name": "Wycombe Wanderers", "short": "WYC", "division": "EFL League One", "tier": 3, "primary": "#009CE6", "secondary": "#1A3151", "budgetM": 5, "tm": 2805, "stadium": "Adams Park", "city": "High Wycombe", "capacity": 10137, "founded": 1887, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/57/Adams_Park_from_a_northerly_direction.JPG/1280px-Adams_Park_from_a_northerly_direction.JPG"},
    {"fc27": "Plymouth Argyle", "name": "Plymouth Argyle", "short": "PLY", "division": "EFL League One", "tier": 3, "primary": "#00482B", "secondary": "#FFFFFF", "budgetM": 6, "tm": 2262, "stadium": "Home Park", "city": "Plymouth", "capacity": 17900, "founded": 1886, "img": "https://upload.wikimedia.org/wikipedia/commons/8/8e/Homepark2.png"},
    {"fc27": "Barnsley", "name": "Barnsley", "short": "BAR", "division": "EFL League One", "tier": 3, "primary": "#E31B23", "secondary": "#FFFFFF", "budgetM": 5, "tm": 349, "stadium": "Oakwell", "city": "Barnsley", "capacity": 23287, "founded": 1887, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8c/Oakwell_Stadium-1.Cropped.jpg/1280px-Oakwell_Stadium-1.Cropped.jpg"},
    {"fc27": "Wigan Athletic", "name": "Wigan Athletic", "short": "WIG", "division": "EFL League One", "tier": 3, "primary": "#0054A6", "secondary": "#FFFFFF", "budgetM": 5, "tm": 1071, "stadium": "Brick Community Stadium", "city": "Wigan", "capacity": 25138, "founded": 1932, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Wigan_athletics_dw_stadium.jpg/1280px-Wigan_athletics_dw_stadium.jpg"},
    {"fc27": "Notts County", "name": "Notts County", "short": "NOT", "division": "EFL League One", "tier": 3, "primary": "#111111", "secondary": "#FFFFFF", "budgetM": 4, "tm": 1045, "stadium": "Meadow Lane", "city": "Nottingham", "capacity": 19841, "founded": 1862, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Nottingham_county_fc_notts_stadium.jpg/1280px-Nottingham_county_fc_notts_stadium.jpg"},
    # --- EFL League Two (4 clubs, tier 4) ---
    {"fc27": "Salford City", "name": "Salford City", "short": "SAL", "division": "EFL League Two", "tier": 4, "primary": "#DA1F26", "secondary": "#111111", "budgetM": 3, "tm": 34888, "stadium": "Peninsula Stadium", "city": "Salford", "capacity": 5108, "founded": 1940, "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/The_Peninsula_Stadium_at_night_-_Salford_City_-_Aug_24.jpg/1280px-The_Peninsula_Stadium_at_night_-_Salford_City_-_Aug_24.jpg"},
    {"fc27": "Port Vale", "name": "Port Vale", "short": "PVL", "division": "EFL League Two", "tier": 4, "primary": "#FFFFFF", "secondary": "#111111", "budgetM": 3, "tm": 1211, "stadium": "Vale Park", "city": "Stoke-on-Trent", "capacity": 15036, "founded": 1876, "img": "https://upload.wikimedia.org/wikipedia/commons/e/ee/Port_Vale_Football_Club_-_geograph.org.uk_-_627252.jpg"},
    {"fc27": "Swindon Town", "name": "Swindon Town", "short": "SWI", "division": "EFL League Two", "tier": 4, "primary": "#E01A22", "secondary": "#FFFFFF", "budgetM": 2, "tm": 352, "stadium": "County Ground", "city": "Swindon", "capacity": 15728, "founded": 1879, "img": "https://upload.wikimedia.org/wikipedia/commons/c/cc/Don_Rogers_Stand_2014-05-03_14-42.jpg"},
    {"fc27": "Chesterfield", "name": "Chesterfield", "short": "CHF", "division": "EFL League Two", "tier": 4, "primary": "#004C99", "secondary": "#FFFFFF", "budgetM": 2, "tm": 1219, "stadium": "SMH Group Stadium", "city": "Chesterfield", "capacity": 10504, "founded": 1866, "img": "https://upload.wikimedia.org/wikipedia/commons/6/64/B2net_Stadium_1_-_geograph-1998863.jpg"},
]

FC27_TO_EFL_CLUB: dict[str, dict[str, Any]] = {
    (c["fc27"], c["division"]): c for c in EFL_CLUBS
}

CLUB_VISUALS: dict[str, dict[str, Any]] = {
    "Arsenal": {
        "short": "ARS",
        "primary": "#EF0107",
        "secondary": "#FFFFFF",
        "budgetM": 135,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/11.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/London_Emirates_Stadium_arsenal.jpg/1280px-London_Emirates_Stadium_arsenal.jpg",
    },
    "Aston Villa": {
        "short": "AVL",
        "primary": "#670E36",
        "secondary": "#95BFE5",
        "budgetM": 80,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/405.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fe/Birmingham_aston_villa_park_stadium.jpg/1280px-Birmingham_aston_villa_park_stadium.jpg",
    },
    "AFC Bournemouth": {
        "short": "BOU",
        "primary": "#DA291C",
        "secondary": "#000000",
        "budgetM": 55,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/989.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b9/Deancourt_14092013_vblackpool.jpg/1280px-Deancourt_14092013_vblackpool.jpg",
    },
    "Brentford": {
        "short": "BRE",
        "primary": "#E30613",
        "secondary": "#FFFFFF",
        "budgetM": 48,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/1148.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/ff/Brentford_Community_Stadium_2020.jpg/1280px-Brentford_Community_Stadium_2020.jpg",
    },
    "Brighton & Hove Albion": {
        "short": "BHA",
        "primary": "#0057B8",
        "secondary": "#FFCD00",
        "budgetM": 70,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/1237.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/43/Amex_Community_Stadium.jpg/1280px-Amex_Community_Stadium.jpg",
    },
    "Chelsea": {
        "short": "CHE",
        "primary": "#034694",
        "secondary": "#FFFFFF",
        "budgetM": 140,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/631.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/London_Stamford_Bridge.jpg/1280px-London_Stamford_Bridge.jpg",
    },
    "Coventry City": {
        "short": "COV",
        "primary": "#58B9E8",
        "secondary": "#0D1B2A",
        "budgetM": 32,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/990.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Coventry_Derby_October_2021_-_2.jpg/1280px-Coventry_Derby_October_2021_-_2.jpg",
    },
    "Crystal Palace": {
        "short": "CRY",
        "primary": "#1B458F",
        "secondary": "#C4122E",
        "budgetM": 52,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/873.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/66/2023_09_09_arne_mueseler_17_18_07_00743-Verbessert-RR_%2853283239217%29.jpg/1280px-2023_09_09_arne_mueseler_17_18_07_00743-Verbessert-RR_%2853283239217%29.jpg",
    },
    "Everton": {
        "short": "EVE",
        "primary": "#003399",
        "secondary": "#FFFFFF",
        "budgetM": 46,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/29.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/95/Hill_Dickinson_Stadium%2C_Liverpool_Waterfront_-_geograph.org.uk_-_8170881.jpg/500px-Hill_Dickinson_Stadium%2C_Liverpool_Waterfront_-_geograph.org.uk_-_8170881.jpg",
    },
    "Fulham": {
        "short": "FUL",
        "primary": "#111111",
        "secondary": "#CC0000",
        "budgetM": 50,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/931.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/Craven_Cottage_%28Fulham%29.jpg/1280px-Craven_Cottage_%28Fulham%29.jpg",
    },
    "Hull City": {
        "short": "HUL",
        "primary": "#F59E0B",
        "secondary": "#111111",
        "budgetM": 28,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/3008.png",
        "stadiumImageUrl": "https://upload.wikimedia.org/wikipedia/commons/d/d3/Match_day_at_the_KC_Stadium_-_geograph.org.uk_-_1497910.jpg",
    },
    "Ipswich Town": {
        "short": "IPS",
        "primary": "#3A64A3",
        "secondary": "#FFFFFF",
        "budgetM": 35,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/677.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/27/Portman_Road_aerial_%28cropped%29.jpg/1280px-Portman_Road_aerial_%28cropped%29.jpg",
    },
    "Leeds United": {
        "short": "LEE",
        "primary": "#FFCD00",
        "secondary": "#1D428A",
        "budgetM": 44,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/399.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/84/Leeds_United_-_31559864360.jpg/1280px-Leeds_United_-_31559864360.jpg",
    },
    "Liverpool": {
        "short": "LIV",
        "primary": "#C8102E",
        "secondary": "#00B2A9",
        "budgetM": 145,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/31.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f8/Liverpool_anfield_road_stadium.jpg/1280px-Liverpool_anfield_road_stadium.jpg",
    },
    "Manchester City": {
        "short": "MCI",
        "primary": "#6CABDD",
        "secondary": "#1C2C5B",
        "budgetM": 160,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/281.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b8/Etihad_Stadium.jpg/1280px-Etihad_Stadium.jpg",
    },
    "Manchester United": {
        "short": "MUN",
        "primary": "#DA291C",
        "secondary": "#FBE122",
        "budgetM": 130,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/985.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1a/2023_07_31_arne_mueseler_00060-Verbessert-RR_%2853106651455%29.jpg/1280px-2023_07_31_arne_mueseler_00060-Verbessert-RR_%2853106651455%29.jpg",
    },
    "Newcastle United": {
        "short": "NEW",
        "primary": "#241F20",
        "secondary": "#FFFFFF",
        "budgetM": 105,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/762.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a2/Newcastle_st-james-park_stadium.jpg/1280px-Newcastle_st-james-park_stadium.jpg",
    },
    "Nottingham Forest": {
        "short": "NFO",
        "primary": "#DD0000",
        "secondary": "#FFFFFF",
        "budgetM": 54,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/703.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ae/CityGroundFromAboveTrentBridgeCricketGround.jpg/1280px-CityGroundFromAboveTrentBridgeCricketGround.jpg",
    },
    "Sunderland": {
        "short": "SUN",
        "primary": "#EB172B",
        "secondary": "#FFFFFF",
        "budgetM": 34,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/289.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b1/Sunderland_stadium_of_light.jpg/1280px-Sunderland_stadium_of_light.jpg",
    },
    "Tottenham Hotspur": {
        "short": "TOT",
        "primary": "#132257",
        "secondary": "#FFFFFF",
        "budgetM": 115,
        "badgeUrl": "https://tmssl.akamaized.net//images/wappen/head/148.png",
        "stadiumImageUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/be/London_Tottenham_Hotspur_Stadium.jpg/1280px-London_Tottenham_Hotspur_Stadium.jpg",
    },
}


def download_with_cache(url: str, cache_name: str, retries: int = 3) -> bytes:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = RAW_DIR / cache_name
    if cache_path.exists() and cache_path.stat().st_size > 0:
        print(f"[cache] Using {cache_path}")
        return cache_path.read_bytes()

    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            print(f"[fetch] Downloading {cache_name} (attempt {attempt}/{retries})...")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = resp.read()
            cache_path.write_bytes(data)
            print(f"[fetch] Saved {cache_path} ({len(data) // 1024} KB)")
            return data
        except Exception as err:
            last_err = err
            print(f"[warn] Attempt {attempt} failed for {cache_name}: {err}")
            time.sleep(2 * attempt)
    raise RuntimeError(f"Failed to download {url}: {last_err}")


def normalize_name(name: str) -> str:
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def to_int(val: Any, default: int = 0) -> int:
    if val is None or val == "":
        return default
    try:
        return int(round(float(val)))
    except (ValueError, TypeError):
        return default


def parse_height_cm(raw: str) -> int:
    m = re.search(r"(\d+)\s*cm", raw or "")
    return int(m.group(1)) if m else 180


def parse_weight_kg(raw: str) -> int:
    m = re.search(r"(\d+)\s*kg", raw or "")
    return int(m.group(1)) if m else 75


def classify_role(primary_pos: str) -> str:
    pos = primary_pos.upper().strip()
    if pos == "GK":
        return "GK"
    if pos in {"CB", "LB", "RB", "LWB", "RWB"}:
        return "DEF"
    if pos in {"CDM", "CM", "CAM", "LM", "RM"}:
        return "MID"
    if pos in {"ST", "CF", "LW", "RW", "LF", "RF"}:
        return "ATT"
    return "MID"


def estimate_market_value(overall: int, age: int) -> int:
    # Smooth exponential curve anchored at elite/avg/youth valuations
    base = 150_000 * (1.235 ** max(0, overall - 60))
    if age <= 21:
        age_factor = 1.35
    elif age <= 25:
        age_factor = 1.25
    elif age <= 28:
        age_factor = 1.05
    elif age <= 31:
        age_factor = 0.72
    else:
        age_factor = max(0.22, 0.55 - (age - 31) * 0.08)
    val = int(round((base * age_factor) / 50_000) * 50_000)
    return max(250_000, min(200_000_000, val))


def estimate_weekly_wage(overall: int, market_value_eur: int) -> int:
    base = 4_500 * (1.165 ** max(0, overall - 62))
    val_component = market_value_eur * 0.0018
    wage = int(round((base * 0.65 + val_component * 0.35) / 500) * 500)
    return max(3_500, min(420_000, wage))


def load_transfermarkt_lookup(tm_gz_bytes: bytes) -> dict[str, dict[str, Any]]:
    print("[etl] Indexing Transfermarkt players...")
    lookup: dict[str, dict[str, Any]] = {}
    with gzip.GzipFile(fileobj=io.BytesIO(tm_gz_bytes)) as gz:
        reader = csv.DictReader(io.TextIOWrapper(gz, encoding="utf-8", errors="replace"))
        for row in reader:
            name = row.get("name") or ""
            key = normalize_name(name)
            if not key:
                continue
            season = to_int(row.get("last_season"), 0)
            mv = to_int(row.get("market_value_in_eur"), 0)
            prev = lookup.get(key)
            # Prefer more recent season and higher market value on name collision
            if prev is None or (season, mv) > (prev["last_season"], prev["market_value_eur"]):
                lookup[key] = {
                    "last_season": season,
                    "market_value_eur": mv,
                    "image_url": (row.get("image_url") or "").strip(),
                    "contract_expiration": (row.get("contract_expiration_date") or "")[:10],
                    "tm_club": (row.get("current_club_name") or "").strip(),
                }
    print(f"[etl] Indexed {len(lookup)} unique Transfermarkt names")
    return lookup


def main() -> None:
    fc27_zip = zipfile.ZipFile(io.BytesIO(download_with_cache(KAGGLE_URLS["fc27"], "fc27.zip")))
    pl_zip = zipfile.ZipFile(io.BytesIO(download_with_cache(KAGGLE_URLS["pl2627"], "pl2627.zip")))
    wc_zip = zipfile.ZipFile(io.BytesIO(download_with_cache(KAGGLE_URLS["wc26"], "wc26.zip")))
    tm_bytes = download_with_cache(TM_PLAYERS_URL, "tm_players.csv.gz")

    tm_lookup = load_transfermarkt_lookup(tm_bytes)

    # 1. Referees
    referees: list[dict[str, Any]] = []
    with wc_zip.open("referees.csv") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            referees.append({
                "id": to_int(row["referee_id"]),
                "name": row["name"].strip(),
                "country": row["country"].strip(),
                "avgCardsPerGame": float(row["avg_cards_per_game"] or 4.0),
            })

    # 2. Premier League Clubs (Teams, Stadiums, Managers)
    managers_by_team: dict[str, dict[str, str]] = {}
    with pl_zip.open("managers_and_club_info.csv") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            managers_by_team[row["team"].strip()] = row

    clubs: list[dict[str, Any]] = []
    club_id_by_name: dict[str, int] = {}
    with pl_zip.open("teams_and_stadiums.csv") as f:
        for idx, row in enumerate(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")), start=1):
            name = row["team"].strip()
            mgr = managers_by_team.get(name, {})
            vis = CLUB_VISUALS[name]
            club_id_by_name[name] = idx
            budget_eur = vis["budgetM"] * 1_000_000
            clubs.append({
                "id": idx,
                "name": name,
                "shortName": vis["short"],
                "division": "Premier League",
                "tier": 1,
                "primaryColor": vis["primary"],
                "secondaryColor": vis["secondary"],
                "badgeUrl": vis["badgeUrl"],
                "stadiumImageUrl": vis["stadiumImageUrl"],
                "stadium": row["stadium"].strip(),
                "city": row["city"].strip(),
                "capacity": to_int(row["capacity_2026_27"], 30000),
                "capacityNote": row["capacity_note"].strip(),
                "foundedYear": to_int(row["founded_year"], 1900),
                "status": row["status_for_2026_27"].strip(),
                "previousSeasonContext": row["previous_season_context"].strip(),
                "manager": (mgr.get("manager") or "Caretaker Manager").strip(),
                "managerNationality": (mgr.get("manager_nationality") or "English").strip(),
                "managerAppointed": (mgr.get("appointed") or "2026").strip(),
                "previousClub": (mgr.get("previous_club_as_manager") or "").strip(),
                "notableHonours": (mgr.get("notable_honours_as_manager") or "").strip(),
                "transferBudgetEur": budget_eur,
                "wageBudgetWeeklyEur": int(round(budget_eur * 0.022 / 1000) * 1000),
                "avgOverall": 75,
            })

    # Add 44 EFL Championship / League One / League Two clubs
    next_club_id = len(clubs) + 1
    for spec in EFL_CLUBS:
        cname = spec["name"]
        club_id_by_name[cname] = next_club_id
        budget_eur = spec["budgetM"] * 1_000_000
        clubs.append({
            "id": next_club_id,
            "name": cname,
            "shortName": spec["short"],
            "division": spec["division"],
            "tier": spec["tier"],
            "primaryColor": spec["primary"],
            "secondaryColor": spec["secondary"],
            "badgeUrl": f"https://tmssl.akamaized.net//images/wappen/head/{spec['tm']}.png",
            "stadiumImageUrl": spec["img"],
            "stadium": spec["stadium"],
            "city": spec["city"],
            "capacity": spec["capacity"],
            "capacityNote": "",
            "foundedYear": spec["founded"],
            "status": spec["division"],
            "previousSeasonContext": f"Disputando a {spec['division']} e a Copa da Inglaterra (FA Cup) na temporada 2026/27.",
            "manager": "Técnico Principal",
            "managerNationality": "England",
            "managerAppointed": "2026",
            "previousClub": "",
            "notableHonours": "",
            "transferBudgetEur": budget_eur,
            "wageBudgetWeeklyEur": max(60_000, int(round(budget_eur * 0.024 / 1000) * 1000)),
            "avgOverall": 70 - (spec["tier"] - 1) * 4,
        })
        next_club_id += 1

    # 3. Players (64 English Clubs across 4 Divisions + Top International Market Players)
    players: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str]] = set()

    with fc27_zip.open("fc27_players_database.csv") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
        next_player_id = 1
        for row in reader:
            if row.get("rarity") != "Rare":
                continue

            league = (row.get("league") or "").strip()
            raw_club = (row.get("club") or "").strip()
            overall = to_int(row.get("overall"), 70)

            is_pl = league == "Premier League" and raw_club in FC27_TO_PL_CLUB
            efl_spec = FC27_TO_EFL_CLUB.get((raw_club, league))
            is_english_club = is_pl or (efl_spec is not None)
            is_market = (not is_english_club) and (league in MARKET_LEAGUES) and overall >= 79
            if not is_english_club and not is_market:
                continue

            player_name = (row.get("player_name") or "").strip()
            full_name = (row.get("full_name") or player_name).strip()
            dedup_key = (normalize_name(player_name), raw_club.lower())
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)

            if is_pl:
                club_name = FC27_TO_PL_CLUB[raw_club]
                club_id = club_id_by_name[club_name]
                player_league = "Premier League"
            elif efl_spec is not None:
                club_name = efl_spec["name"]
                club_id = club_id_by_name[club_name]
                player_league = efl_spec["division"]
            else:
                club_name = raw_club
                club_id = None
                player_league = league

            raw_positions = [p.strip() for p in (row.get("positions") or "CM").split(",") if p.strip()]
            primary_pos = raw_positions[0] if raw_positions else "CM"
            role_cat = classify_role(primary_pos)
            is_gk = primary_pos == "GK"

            age = to_int(row.get("age"), 25)

            # Face attributes (fill safe non-null numbers for GK as specified)
            if is_gk:
                pace = round(overall * 0.65)
                shooting = round(overall * 0.50)
                passing = round(overall * 0.80)
                dribbling = round(overall * 0.72)
                defending = overall
                physicality = round(overall * 0.88)
                reflexes = to_int(row.get("stat_reactions"), overall) or overall
            else:
                pace = to_int(row.get("face_pace"), round(overall * 0.82))
                shooting = to_int(row.get("face_shooting"), round(overall * 0.72))
                passing = to_int(row.get("face_passing"), round(overall * 0.76))
                dribbling = to_int(row.get("face_dribbling"), round(overall * 0.78))
                defending = to_int(row.get("face_defending"), round(overall * 0.62))
                physicality = to_int(row.get("face_physicality"), round(overall * 0.78))
                reflexes = to_int(row.get("stat_reactions"), overall)

            def stat_or(col: str, fallback: int) -> int:
                v = to_int(row.get(col), -1)
                return v if v > 0 else max(30, min(99, fallback))

            detailed_stats = {
                "acceleration": stat_or("stat_acceleration", pace),
                "sprintSpeed": stat_or("stat_sprint_speed", pace),
                "positioning": stat_or("stat_positioning", shooting if not is_gk else overall),
                "finishing": stat_or("stat_finishing", shooting),
                "shotPower": stat_or("stat_shot_power", max(shooting, physicality - 5)),
                "longShots": stat_or("stat_long_shots", shooting - 3),
                "vision": stat_or("stat_vision", passing),
                "crossing": stat_or("stat_crossing", passing - 4),
                "shortPassing": stat_or("stat_short_passing", passing + 2),
                "longPassing": stat_or("stat_long_passing", passing - 2),
                "dribbling": stat_or("stat_dribbling", dribbling),
                "agility": stat_or("stat_agility", dribbling),
                "reactions": stat_or("stat_reactions", reflexes),
                "ballControl": stat_or("stat_ball_control", dribbling),
                "composure": stat_or("stat_composure", overall - 2),
                "interceptions": stat_or("stat_interceptions", defending),
                "headingAccuracy": stat_or("stat_heading_accuracy", round((defending + physicality) / 2)),
                "defensiveAwareness": stat_or("stat_defensive_awareness", defending),
                "standingTackle": stat_or("stat_standing_tackle", defending),
                "slidingTackle": stat_or("stat_sliding_tackle", defending - 3),
                "jumping": stat_or("stat_jumping", physicality),
                "stamina": stat_or("stat_stamina", physicality),
                "strength": stat_or("stat_strength", physicality),
                "aggression": stat_or("stat_aggression", physicality - 4),
            }

            # Enrich with Transfermarkt (photo, market value, contract)
            tm = tm_lookup.get(normalize_name(player_name)) or tm_lookup.get(normalize_name(full_name))
            tm_mv = tm["market_value_eur"] if tm and tm["market_value_eur"] > 0 else 0
            market_value_eur = tm_mv if tm_mv > 0 else estimate_market_value(overall, age)
            image_url = tm["image_url"] if tm and tm["image_url"] else ""
            contract_until = tm["contract_expiration"] if tm and tm["contract_expiration"] else "2028-06-30"
            if not contract_until or len(contract_until) < 4:
                contract_until = "2028-06-30"

            wage_eur = estimate_weekly_wage(overall, market_value_eur)

            playstyles_plus = [
                p.strip() for p in (row.get("playstyles_plus") or "").split(",") if p.strip()
            ]
            playstyles_base = [
                p.strip() for p in (row.get("playstyles_base") or "").split(",") if p.strip()
            ]

            players.append({
                "id": next_player_id,
                "eaId": to_int(row.get("eaId"), next_player_id),
                "name": player_name,
                "fullName": full_name,
                "clubId": club_id,
                "clubName": club_name,
                "league": player_league,
                "overall": overall,
                "potential": min(96, overall + (6 if age <= 21 else 3 if age <= 24 else 1 if age <= 27 else 0)),
                "primaryPosition": primary_pos,
                "positions": raw_positions,
                "roleCategory": role_cat,
                "nationality": (row.get("nation") or "England").strip(),
                "age": age,
                "heightCm": parse_height_cm(row.get("height") or ""),
                "weightKg": parse_weight_kg(row.get("weight") or ""),
                "preferredFoot": (row.get("preferred_foot") or "Right").strip(),
                "weakFoot": to_int(row.get("weak_foot"), 3),
                "skillMoves": to_int(row.get("skill_moves"), 3),
                "accelerateType": (row.get("accelerate_type") or "Controlled").strip(),
                "playstylesPlus": playstyles_plus,
                "playstylesBase": playstyles_base,
                "fcIqRoles": (row.get("fc_iq_roles") or "").strip(),
                "faceStats": {
                    "pace": pace,
                    "shooting": shooting,
                    "passing": passing,
                    "dribbling": dribbling,
                    "defending": defending,
                    "physicality": physicality,
                    "reflexes": reflexes,
                },
                "stats": detailed_stats,
                "imageUrl": image_url,
                "marketValueEur": market_value_eur,
                "wageEur": wage_eur,
                "contractUntil": contract_until,
                "morale": 80,
                "stamina": 100,
                "seasonGoals": 0,
                "seasonAssists": 0,
                "seasonAppearances": 0,
                "seasonYellowCards": 0,
                "seasonRedCards": 0,
                "seasonAvgRating": 0,
            })
            next_player_id += 1

    # Ensure every English club (all 64) has >= 18 players and positional balance (>=2 GK, >=6 DEF, >=5 MID, >=4 ATT)
    first_names_uk = [
        "Oliver", "Jack", "Harry", "George", "Charlie", "Callum", "Liam", "Alfie", "Ethan",
        "Mason", "Noah", "Harvey", "Lewis", "Kieran", "Sam", "Nathan", "Toby", "Dan", "Ben", "Josh",
    ]
    last_names_uk = [
        "Smith", "Jones", "Taylor", "Brown", "Wilson", "Evans", "Thomas", "Roberts", "Walker",
        "Wright", "Thompson", "White", "Hughes", "Edwards", "Green", "Hall", "Wood", "Clarke", "Cooper", "Ward",
    ]
    pos_by_cat = {
        "GK": "GK",
        "DEF": ["CB", "LB", "RB", "CB"],
        "MID": ["CM", "CDM", "CAM", "RM"],
        "ATT": ["ST", "LW", "RW", "ST"],
    }

    def make_depth_player(club: dict[str, Any], cat: str, seq_idx: int) -> dict[str, Any]:
        nonlocal next_player_id
        tier = club["tier"]
        base_min = {1: 68, 2: 64, 3: 59, 4: 56}.get(tier, 62)
        overall = base_min + ((club["id"] * 7 + seq_idx * 3) % 6)
        age = 19 + ((club["id"] + seq_idx * 5) % 10)
        fn = first_names_uk[(club["id"] * 3 + seq_idx) % len(first_names_uk)]
        ln = last_names_uk[(club["id"] * 5 + seq_idx * 2) % len(last_names_uk)]
        short_n = f"{fn[0]}. {ln}"
        full_n = f"{fn} {ln}"
        pos_list = pos_by_cat[cat]
        primary_pos = pos_list if isinstance(pos_list, str) else pos_list[seq_idx % len(pos_list)]
        is_gk = cat == "GK"
        pace = max(40, overall - (18 if is_gk else 1))
        shooting = max(35, overall - (30 if is_gk else 14 if cat == "DEF" else 3))
        passing = max(45, overall - (12 if is_gk else 3))
        dribbling = max(40, overall - (16 if is_gk else 4))
        defending = max(35, overall if (is_gk or cat == "DEF") else overall - 22 if cat == "ATT" else overall - 8)
        physicality = max(50, overall - 2)
        mv = estimate_market_value(overall, age)
        wage = estimate_weekly_wage(overall, mv)
        pid = next_player_id
        next_player_id += 1
        return {
            "id": pid,
            "eaId": 900000 + pid,
            "name": short_n,
            "fullName": full_n,
            "clubId": club["id"],
            "clubName": club["name"],
            "league": club["division"],
            "overall": overall,
            "potential": min(85, overall + (6 if age <= 21 else 3)),
            "primaryPosition": primary_pos,
            "positions": [primary_pos],
            "roleCategory": cat,
            "nationality": "England",
            "age": age,
            "heightCm": 188 if is_gk else 179,
            "weightKg": 82 if is_gk else 74,
            "preferredFoot": "Left" if seq_idx % 4 == 0 else "Right",
            "weakFoot": 3,
            "skillMoves": 2 if (is_gk or cat == "DEF") else 3,
            "accelerateType": "Controlled",
            "playstylesPlus": [],
            "playstylesBase": [],
            "fcIqRoles": "",
            "faceStats": {
                "pace": pace,
                "shooting": shooting,
                "passing": passing,
                "dribbling": dribbling,
                "defending": defending,
                "physicality": physicality,
                "reflexes": overall if is_gk else max(50, overall - 4),
            },
            "stats": {
                "acceleration": pace,
                "sprintSpeed": pace,
                "positioning": overall if is_gk else max(45, shooting + 2),
                "finishing": shooting,
                "shotPower": max(shooting, physicality - 4),
                "longShots": max(35, shooting - 3),
                "vision": passing,
                "crossing": max(40, passing - 3),
                "shortPassing": min(95, passing + 2),
                "longPassing": max(40, passing - 2),
                "dribbling": dribbling,
                "agility": dribbling,
                "reactions": overall,
                "ballControl": dribbling,
                "composure": max(45, overall - 2),
                "interceptions": defending,
                "headingAccuracy": round((defending + physicality) / 2),
                "defensiveAwareness": defending,
                "standingTackle": defending,
                "slidingTackle": max(35, defending - 3),
                "jumping": physicality,
                "stamina": min(92, physicality + 4),
                "strength": physicality,
                "aggression": max(45, physicality - 3),
            },
            "imageUrl": "",
            "marketValueEur": mv,
            "wageEur": wage,
            "contractUntil": "2028-06-30",
            "morale": 80,
            "stamina": 100,
            "seasonGoals": 0,
            "seasonAssists": 0,
            "seasonAppearances": 0,
            "seasonYellowCards": 0,
            "seasonRedCards": 0,
            "seasonAvgRating": 0,
        }

    for club in clubs:
        c_squad = [p for p in players if p["clubId"] == club["id"]]
        counts = {"GK": 0, "DEF": 0, "MID": 0, "ATT": 0}
        for p in c_squad:
            counts[p["roleCategory"]] = counts.get(p["roleCategory"], 0) + 1
        seq = 1
        for cat, req_n in [("GK", 2), ("DEF", 6), ("MID", 5), ("ATT", 4)]:
            while counts[cat] < req_n:
                np_obj = make_depth_player(club, cat, seq)
                players.append(np_obj)
                c_squad.append(np_obj)
                counts[cat] += 1
                seq += 1
        rot = ["DEF", "MID", "ATT", "MID", "DEF"]
        while len(c_squad) < 18:
            cat = rot[seq % len(rot)]
            np_obj = make_depth_player(club, cat, seq)
            players.append(np_obj)
            c_squad.append(np_obj)
            seq += 1

    # Update club average overalls
    for club in clubs:
        squad = [p for p in players if p["clubId"] == club["id"]]
        if squad:
            top16 = sorted((p["overall"] for p in squad), reverse=True)[:16]
            club["avgOverall"] = round(sum(top16) / len(top16), 1)

    # 4. Fixtures (380 PL 2026/27 matches)
    fixtures: list[dict[str, Any]] = []
    with pl_zip.open("fixtures.csv") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            match_num = to_int(row["match_number"])
            home_name = row["home_team"].strip()
            away_name = row["away_team"].strip()
            ref = referees[(match_num * 7) % len(referees)]
            fixtures.append({
                "id": match_num,
                "matchweek": to_int(row["matchweek"]),
                "date": row["date"].strip(),
                "kickoffTimeUk": row["kickoff_time_uk"].strip(),
                "homeClubId": club_id_by_name[home_name],
                "awayClubId": club_id_by_name[away_name],
                "tvBroadcaster": row["tv_broadcaster"].strip() or "Premier League TV",
                "refereeId": ref["id"],
                "played": False,
                "homeGoals": None,
                "awayGoals": None,
            })

    # 5. Write SQLite database
    if SQLITE_PATH.exists():
        SQLITE_PATH.unlink()
    SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(SQLITE_PATH)
    cur = conn.cursor()

    cur.executescript(
        """
        CREATE TABLE clubs (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            short_name TEXT NOT NULL,
            division TEXT NOT NULL,
            tier INTEGER NOT NULL,
            primary_color TEXT NOT NULL,
            secondary_color TEXT NOT NULL,
            badge_url TEXT,
            stadium_image_url TEXT,
            stadium TEXT NOT NULL,
            city TEXT NOT NULL,
            capacity INTEGER NOT NULL,
            capacity_note TEXT,
            founded_year INTEGER NOT NULL,
            status TEXT,
            previous_season_context TEXT,
            manager TEXT NOT NULL,
            manager_nationality TEXT,
            manager_appointed TEXT,
            previous_club TEXT,
            notable_honours TEXT,
            transfer_budget_eur INTEGER NOT NULL,
            wage_budget_weekly_eur INTEGER NOT NULL,
            avg_overall REAL NOT NULL
        );

        CREATE TABLE referees (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            country TEXT NOT NULL,
            avg_cards_per_game REAL NOT NULL
        );

        CREATE TABLE players (
            id INTEGER PRIMARY KEY,
            ea_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            full_name TEXT NOT NULL,
            club_id INTEGER,
            club_name TEXT NOT NULL,
            league TEXT NOT NULL,
            overall INTEGER NOT NULL,
            potential INTEGER NOT NULL,
            primary_position TEXT NOT NULL,
            positions_json TEXT NOT NULL,
            role_category TEXT NOT NULL,
            nationality TEXT NOT NULL,
            age INTEGER NOT NULL,
            height_cm INTEGER NOT NULL,
            weight_kg INTEGER NOT NULL,
            preferred_foot TEXT NOT NULL,
            weak_foot INTEGER NOT NULL,
            skill_moves INTEGER NOT NULL,
            accelerate_type TEXT,
            playstyles_plus_json TEXT,
            playstyles_base_json TEXT,
            fc_iq_roles TEXT,
            face_stats_json TEXT NOT NULL,
            stats_json TEXT NOT NULL,
            image_url TEXT,
            market_value_eur INTEGER NOT NULL,
            wage_eur INTEGER NOT NULL,
            contract_until TEXT,
            FOREIGN KEY (club_id) REFERENCES clubs(id)
        );

        CREATE TABLE fixtures (
            id INTEGER PRIMARY KEY,
            matchweek INTEGER NOT NULL,
            date TEXT NOT NULL,
            kickoff_time_uk TEXT NOT NULL,
            home_club_id INTEGER NOT NULL,
            away_club_id INTEGER NOT NULL,
            tv_broadcaster TEXT,
            referee_id INTEGER NOT NULL,
            played INTEGER NOT NULL DEFAULT 0,
            home_goals INTEGER,
            away_goals INTEGER,
            FOREIGN KEY (home_club_id) REFERENCES clubs(id),
            FOREIGN KEY (away_club_id) REFERENCES clubs(id),
            FOREIGN KEY (referee_id) REFERENCES referees(id)
        );
        """
    )

    cur.executemany(
        """
        INSERT INTO clubs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                c["id"], c["name"], c["shortName"], c["division"], c["tier"],
                c["primaryColor"], c["secondaryColor"],
                c["badgeUrl"], c["stadiumImageUrl"],
                c["stadium"], c["city"], c["capacity"], c["capacityNote"], c["foundedYear"],
                c["status"], c["previousSeasonContext"], c["manager"], c["managerNationality"],
                c["managerAppointed"], c["previousClub"], c["notableHonours"],
                c["transferBudgetEur"], c["wageBudgetWeeklyEur"], c["avgOverall"],
            )
            for c in clubs
        ],
    )

    cur.executemany(
        "INSERT INTO referees VALUES (?, ?, ?, ?)",
        [(r["id"], r["name"], r["country"], r["avgCardsPerGame"]) for r in referees],
    )

    cur.executemany(
        """
        INSERT INTO players VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                p["id"], p["eaId"], p["name"], p["fullName"], p["clubId"], p["clubName"],
                p["league"], p["overall"], p["potential"], p["primaryPosition"],
                json.dumps(p["positions"]), p["roleCategory"], p["nationality"], p["age"],
                p["heightCm"], p["weightKg"], p["preferredFoot"], p["weakFoot"],
                p["skillMoves"], p["accelerateType"], json.dumps(p["playstylesPlus"]),
                json.dumps(p["playstylesBase"]), p["fcIqRoles"],
                json.dumps(p["faceStats"]), json.dumps(p["stats"]),
                p["imageUrl"], p["marketValueEur"], p["wageEur"], p["contractUntil"],
            )
            for p in players
        ],
    )

    cur.executemany(
        "INSERT INTO fixtures VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            (
                fx["id"], fx["matchweek"], fx["date"], fx["kickoffTimeUk"],
                fx["homeClubId"], fx["awayClubId"], fx["tvBroadcaster"],
                fx["refereeId"], 0, None, None,
            )
            for fx in fixtures
        ],
    )

    conn.commit()
    conn.close()

    # 6. Export consolidated JSON for instant frontend loading
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "season": "2026/27",
        "league": "Premier League",
        "clubs": clubs,
        "referees": referees,
        "players": players,
        "fixtures": fixtures,
    }
    JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    pl_players_count = sum(1 for p in players if p["clubId"] is not None)
    market_players_count = sum(1 for p in players if p["clubId"] is None)
    tm_matched = sum(1 for p in players if p["imageUrl"])

    print(f"\n[done] SQLite written to {SQLITE_PATH}")
    print(f"[done] JSON written to {JSON_PATH} ({JSON_PATH.stat().st_size // 1024} KB)")
    print(f"  Clubs:           {len(clubs)}")
    print(f"  Fixtures:        {len(fixtures)}")
    print(f"  Referees:        {len(referees)}")
    print(f"  PL Players:      {pl_players_count}")
    print(f"  Market Players:  {market_players_count}")
    print(f"  Total Players:   {len(players)}")
    print(f"  TM Photo Match:  {tm_matched} / {len(players)}")


if __name__ == "__main__":
    main()
