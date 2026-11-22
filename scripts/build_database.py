#!/usr/bin/env python3
"""
ETL Pipeline for Football Manager 2026/27 — Unified Global Database.
Synchronizes data across 10 nations and 13 leagues:
  - England (Premier League, EFL Championship, EFL League One, EFL League Two)
  - Spain (LALIGA EA SPORTS)
  - Italy (Serie A Enilive)
  - Germany (Bundesliga)
  - France (Ligue 1 McDonald's)
  - Saudi Arabia (ROSHN Saudi League)
  - Brazil (Brasileirão Série A)
  - Portugal (Liga Portugal)
  - Netherlands (Eredivisie)
  - USA (Major League Soccer)

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
from collections import Counter
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

LEAGUES_METADATA = [
    {"id": 1, "code": "ENG_PL", "name": "Premier League", "country": "Inglaterra", "flagEmoji": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "tier": 1, "totalClubs": 20},
    {"id": 2, "code": "ENG_CH", "name": "EFL Championship", "country": "Inglaterra", "flagEmoji": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "tier": 2, "totalClubs": 24},
    {"id": 3, "code": "ENG_L1", "name": "EFL League One", "country": "Inglaterra", "flagEmoji": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "tier": 3, "totalClubs": 16},
    {"id": 4, "code": "ENG_L2", "name": "EFL League Two", "country": "Inglaterra", "flagEmoji": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "tier": 4, "totalClubs": 4},
    {"id": 5, "code": "ESP_LALIGA", "name": "LALIGA EA SPORTS", "country": "Espanha", "flagEmoji": "🇪🇸", "tier": 1, "totalClubs": 20},
    {"id": 6, "code": "ITA_SERIE_A", "name": "Serie A Enilive", "country": "Itália", "flagEmoji": "🇮🇹", "tier": 1, "totalClubs": 20},
    {"id": 7, "code": "GER_BUNDESLIGA", "name": "Bundesliga", "country": "Alemanha", "flagEmoji": "🇩🇪", "tier": 1, "totalClubs": 18},
    {"id": 8, "code": "FRA_LIGUE_1", "name": "Ligue 1 McDonald's", "country": "França", "flagEmoji": "🇫🇷", "tier": 1, "totalClubs": 18},
    {"id": 9, "code": "SAU_SPL", "name": "ROSHN Saudi League", "country": "Arábia Saudita", "flagEmoji": "🇸🇦", "tier": 1, "totalClubs": 16},
    {"id": 10, "code": "BRA_SERIE_A", "name": "Brasileirão Série A", "country": "Brasil", "flagEmoji": "🇧🇷", "tier": 1, "totalClubs": 20},
    {"id": 11, "code": "POR_LIGA", "name": "Liga Portugal", "country": "Portugal", "flagEmoji": "🇵🇹", "tier": 1, "totalClubs": 16},
    {"id": 12, "code": "NED_EREDIVISIE", "name": "Eredivisie", "country": "Holanda", "flagEmoji": "🇳🇱", "tier": 1, "totalClubs": 16},
    {"id": 13, "code": "USA_MLS", "name": "Major League Soccer", "country": "Estados Unidos", "flagEmoji": "🇺🇸", "tier": 1, "totalClubs": 20},
    {"id": 14, "code": "ARG_LPF", "name": "Liga Profesional de Fútbol", "country": "Argentina", "flagEmoji": "🇦🇷", "tier": 1, "totalClubs": 20},
    {"id": 15, "code": "TUR_SUPERLIG", "name": "Trendyol Süper Lig", "country": "Turquia", "flagEmoji": "🇹🇷", "tier": 1, "totalClubs": 18},
    {"id": 16, "code": "MEX_LIGAMX", "name": "Liga BBVA MX", "country": "México", "flagEmoji": "🇲🇽", "tier": 1, "totalClubs": 18},
    {"id": 17, "code": "SCO_PREM", "name": "Scottish Premiership", "country": "Escócia", "flagEmoji": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "tier": 1, "totalClubs": 12},
]

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

# 44 EFL Clubs
EFL_CLUBS: list[dict[str, Any]] = [
    # Championship (24)
    {"fc27": "West Ham", "name": "West Ham United", "short": "WHU", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#7A263A", "secondary": "#1BB1E7", "budgetM": 42, "tm": 379, "stadium": "London Stadium", "city": "London", "capacity": 62500, "founded": 1895, "coach": "Julen Lopetegui"},
    {"fc27": "Wolves", "name": "Wolverhampton Wanderers", "short": "WOL", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#FDB913", "secondary": "#231F20", "budgetM": 38, "tm": 543, "stadium": "Molineux Stadium", "city": "Wolverhampton", "capacity": 31750, "founded": 1877, "coach": "Gary O'Neil"},
    {"fc27": "Burnley", "name": "Burnley", "short": "BUR", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#6C1D45", "secondary": "#99D6EA", "budgetM": 30, "tm": 1132, "stadium": "Turf Moor", "city": "Burnley", "capacity": 21944, "founded": 1882, "coach": "Scott Parker"},
    {"fc27": "Middlesbrough", "name": "Middlesbrough", "short": "MID", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#E11B22", "secondary": "#FFFFFF", "budgetM": 26, "tm": 641, "stadium": "Riverside Stadium", "city": "Middlesbrough", "capacity": 34742, "founded": 1876, "coach": "Michael Carrick"},
    {"fc27": "Southampton", "name": "Southampton", "short": "SOU", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#D71920", "secondary": "#FFFFFF", "budgetM": 34, "tm": 180, "stadium": "St Mary's Stadium", "city": "Southampton", "capacity": 32384, "founded": 1885, "coach": "Russell Martin"},
    {"fc27": "Sheffield Utd", "name": "Sheffield United", "short": "SHU", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#EE2737", "secondary": "#111111", "budgetM": 25, "tm": 350, "stadium": "Bramall Lane", "city": "Sheffield", "capacity": 32050, "founded": 1889, "coach": "Chris Wilder"},
    {"fc27": "Norwich", "name": "Norwich City", "short": "NOR", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#FFF200", "secondary": "#00A650", "budgetM": 20, "tm": 1123, "stadium": "Carrow Road", "city": "Norwich", "capacity": 27359, "founded": 1902, "coach": "Johannes Hoff Thorup"},
    {"fc27": "Wrexham", "name": "Wrexham", "short": "WRE", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#E41B17", "secondary": "#FFFFFF", "budgetM": 24, "tm": 1112, "stadium": "STōK Cae Ras", "city": "Wrexham", "capacity": 13341, "founded": 1864, "coach": "Phil Parkinson"},
    {"fc27": "Birmingham City", "name": "Birmingham City", "short": "BIR", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#0047AB", "secondary": "#FFFFFF", "budgetM": 24, "tm": 337, "stadium": "St. Andrew's", "city": "Birmingham", "capacity": 29409, "founded": 1875, "coach": "Chris Davies"},
    {"fc27": "Derby County", "name": "Derby County", "short": "DER", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#FFFFFF", "secondary": "#111111", "budgetM": 16, "tm": 22, "stadium": "Pride Park Stadium", "city": "Derby", "capacity": 32956, "founded": 1884, "coach": "Paul Warne"},
    {"fc27": "Swansea City", "name": "Swansea City", "short": "SWA", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#FFFFFF", "secondary": "#111111", "budgetM": 15, "tm": 2288, "stadium": "Swansea.com Stadium", "city": "Swansea", "capacity": 21088, "founded": 1912, "coach": "Luke Williams"},
    {"fc27": "Watford", "name": "Watford", "short": "WAT", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#FBEE23", "secondary": "#ED2127", "budgetM": 18, "tm": 1010, "stadium": "Vicarage Road", "city": "Watford", "capacity": 22200, "founded": 1881, "coach": "Tom Cleverley"},
    {"fc27": "QPR", "name": "Queens Park Rangers", "short": "QPR", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#1D5BA4", "secondary": "#FFFFFF", "budgetM": 14, "tm": 1039, "stadium": "Loftus Road", "city": "London", "capacity": 18439, "founded": 1882, "coach": "Martí Cifuentes"},
    {"fc27": "Millwall", "name": "Millwall", "short": "MIL", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#001D5E", "secondary": "#FFFFFF", "budgetM": 14, "tm": 1028, "stadium": "The Den", "city": "London", "capacity": 20146, "founded": 1885, "coach": "Neil Harris"},
    {"fc27": "West Brom", "name": "West Bromwich Albion", "short": "WBA", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#122F67", "secondary": "#FFFFFF", "budgetM": 18, "tm": 984, "stadium": "The Hawthorns", "city": "West Bromwich", "capacity": 26850, "founded": 1878, "coach": "Carlos Corberán"},
    {"fc27": "Blackburn Rovers", "name": "Blackburn Rovers", "short": "BLB", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#009EE0", "secondary": "#FFFFFF", "budgetM": 14, "tm": 164, "stadium": "Ewood Park", "city": "Blackburn", "capacity": 31367, "founded": 1875, "coach": "John Eustace"},
    {"fc27": "Bristol City", "name": "Bristol City", "short": "BRC", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#E21836", "secondary": "#FFFFFF", "budgetM": 15, "tm": 698, "stadium": "Ashton Gate", "city": "Bristol", "capacity": 27000, "founded": 1894, "coach": "Liam Manning"},
    {"fc27": "Preston", "name": "Preston North End", "short": "PNE", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#FFFFFF", "secondary": "#002B5C", "budgetM": 12, "tm": 466, "stadium": "Deepdale", "city": "Preston", "capacity": 23408, "founded": 1880, "coach": "Paul Heckingbottom"},
    {"fc27": "Portsmouth", "name": "Portsmouth", "short": "POR", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#001489", "secondary": "#FFFFFF", "budgetM": 13, "tm": 1020, "stadium": "Fratton Park", "city": "Portsmouth", "capacity": 20899, "founded": 1898, "coach": "John Mousinho"},
    {"fc27": "Stoke City", "name": "Stoke City", "short": "STK", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#E03A3E", "secondary": "#FFFFFF", "budgetM": 16, "tm": 512, "stadium": "bet365 Stadium", "city": "Stoke-on-Trent", "capacity": 30089, "founded": 1863, "coach": "Narcís Pèlach"},
    {"fc27": "Charlton Ath", "name": "Charlton Athletic", "short": "CHA", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#D4021D", "secondary": "#FFFFFF", "budgetM": 11, "tm": 358, "stadium": "The Valley", "city": "London", "capacity": 27111, "founded": 1905, "coach": "Nathan Jones"},
    {"fc27": "Bolton", "name": "Bolton Wanderers", "short": "BOL", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#FFFFFF", "secondary": "#1C2C5B", "budgetM": 11, "tm": 355, "stadium": "Toughsheet Community Stadium", "city": "Bolton", "capacity": 28723, "founded": 1874, "coach": "Ian Evatt"},
    {"fc27": "Cardiff City", "name": "Cardiff City", "short": "CAR", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#0070B5", "secondary": "#FFFFFF", "budgetM": 13, "tm": 603, "stadium": "Cardiff City Stadium", "city": "Cardiff", "capacity": 33280, "founded": 1899, "coach": "Omer Riza"},
    {"fc27": "Lincoln City", "name": "Lincoln City", "short": "LIN", "country": "Inglaterra", "league": "EFL Championship", "division": "EFL Championship", "tier": 2, "primary": "#E0001B", "secondary": "#FFFFFF", "budgetM": 8, "tm": 1198, "stadium": "LNER Stadium", "city": "Lincoln", "capacity": 10780, "founded": 1884, "coach": "Michael Skubala"},
    # League One (16)
    {"fc27": "Leicester City", "name": "Leicester City", "short": "LEI", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#003090", "secondary": "#FDBE11", "budgetM": 14, "tm": 1003, "stadium": "King Power Stadium", "city": "Leicester", "capacity": 32262, "founded": 1884, "coach": "Steve Cooper"},
    {"fc27": "Luton Town", "name": "Luton Town", "short": "LUT", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#F78F1E", "secondary": "#002D62", "budgetM": 9, "tm": 1031, "stadium": "Kenilworth Road", "city": "Luton", "capacity": 12056, "founded": 1885, "coach": "Rob Edwards"},
    {"fc27": "Sheffield Wed", "name": "Sheffield Wednesday", "short": "SHW", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#0066B3", "secondary": "#FFFFFF", "budgetM": 8, "tm": 1035, "stadium": "Hillsborough Stadium", "city": "Sheffield", "capacity": 34835, "founded": 1867, "coach": "Danny Röhl"},
    {"fc27": "Oxford United", "name": "Oxford United", "short": "OXF", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#FDE100", "secondary": "#002147", "budgetM": 7, "tm": 988, "stadium": "Kassam Stadium", "city": "Oxford", "capacity": 12500, "founded": 1893, "coach": "Des Buckingham"},
    {"fc27": "Huddersfield", "name": "Huddersfield Town", "short": "HUD", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#0E63AD", "secondary": "#FFFFFF", "budgetM": 7, "tm": 1110, "stadium": "John Smith's Stadium", "city": "Huddersfield", "capacity": 24121, "founded": 1908, "coach": "Michael Duff"},
    {"fc27": "Reading", "name": "Reading", "short": "REA", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#004494", "secondary": "#FFFFFF", "budgetM": 6, "tm": 1032, "stadium": "Select Car Leasing Stadium", "city": "Reading", "capacity": 24161, "founded": 1871, "coach": "Rubén Sellés"},
    {"fc27": "Blackpool", "name": "Blackpool", "short": "BLA", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#F68712", "secondary": "#FFFFFF", "budgetM": 6, "tm": 1181, "stadium": "Bloomfield Road", "city": "Blackpool", "capacity": 16616, "founded": 1887, "coach": "Steve Bruce"},
    {"fc27": "MK Dons", "name": "MK Dons", "short": "MKD", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#FFFFFF", "secondary": "#111111", "budgetM": 6, "tm": 991, "stadium": "Stadium MK", "city": "Milton Keynes", "capacity": 30500, "founded": 2004, "coach": "Scott Lindsey"},
    {"fc27": "Leyton Orient", "name": "Leyton Orient", "short": "LEY", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#D91920", "secondary": "#FFFFFF", "budgetM": 5, "tm": 1150, "stadium": "Brisbane Road", "city": "London", "capacity": 9271, "founded": 1881, "coach": "Richie Wellens"},
    {"fc27": "Bradford City", "name": "Bradford City", "short": "BRA", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#7A1230", "secondary": "#F5A623", "budgetM": 5, "tm": 1027, "stadium": "Valley Parade", "city": "Bradford", "capacity": 24840, "founded": 1903, "coach": "Graham Alexander"},
    {"fc27": "Stockport", "name": "Stockport County", "short": "STO", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#004B9B", "secondary": "#FFFFFF", "budgetM": 6, "tm": 1098, "stadium": "Edgeley Park", "city": "Stockport", "capacity": 10852, "founded": 1883, "coach": "Dave Challinor"},
    {"fc27": "Wycombe", "name": "Wycombe Wanderers", "short": "WYC", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#009CE6", "secondary": "#1A3151", "budgetM": 5, "tm": 2805, "stadium": "Adams Park", "city": "High Wycombe", "capacity": 10137, "founded": 1887, "coach": "Matt Bloomfield"},
    {"fc27": "Plymouth Argyle", "name": "Plymouth Argyle", "short": "PLY", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#00482B", "secondary": "#FFFFFF", "budgetM": 6, "tm": 2262, "stadium": "Home Park", "city": "Plymouth", "capacity": 17900, "founded": 1886, "coach": "Wayne Rooney"},
    {"fc27": "Barnsley", "name": "Barnsley", "short": "BAR", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#E31B23", "secondary": "#FFFFFF", "budgetM": 5, "tm": 349, "stadium": "Oakwell", "city": "Barnsley", "capacity": 23287, "founded": 1887, "coach": "Darrell Clarke"},
    {"fc27": "Wigan Athletic", "name": "Wigan Athletic", "short": "WIG", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#0054A6", "secondary": "#FFFFFF", "budgetM": 5, "tm": 1071, "stadium": "Brick Community Stadium", "city": "Wigan", "capacity": 25138, "founded": 1932, "coach": "Shaun Maloney"},
    {"fc27": "Notts County", "name": "Notts County", "short": "NOT", "country": "Inglaterra", "league": "EFL League One", "division": "EFL League One", "tier": 3, "primary": "#111111", "secondary": "#FFFFFF", "budgetM": 4, "tm": 1045, "stadium": "Meadow Lane", "city": "Nottingham", "capacity": 19841, "founded": 1862, "coach": "Stuart Maynard"},
    # League Two (4)
    {"fc27": "Salford City", "name": "Salford City", "short": "SAL", "country": "Inglaterra", "league": "EFL League Two", "division": "EFL League Two", "tier": 4, "primary": "#DA1F26", "secondary": "#111111", "budgetM": 3, "tm": 34888, "stadium": "Peninsula Stadium", "city": "Salford", "capacity": 5108, "founded": 1940, "coach": "Karl Robinson"},
    {"fc27": "Port Vale", "name": "Port Vale", "short": "PVL", "country": "Inglaterra", "league": "EFL League Two", "division": "EFL League Two", "tier": 4, "primary": "#FFFFFF", "secondary": "#111111", "budgetM": 3, "tm": 1211, "stadium": "Vale Park", "city": "Stoke-on-Trent", "capacity": 15036, "founded": 1876, "coach": "Darren Moore"},
    {"fc27": "Swindon Town", "name": "Swindon Town", "short": "SWI", "country": "Inglaterra", "league": "EFL League Two", "division": "EFL League Two", "tier": 4, "primary": "#E01A22", "secondary": "#FFFFFF", "budgetM": 2, "tm": 352, "stadium": "County Ground", "city": "Swindon", "capacity": 15728, "founded": 1879, "coach": "Ian Holloway"},
    {"fc27": "Chesterfield", "name": "Chesterfield", "short": "CHF", "country": "Inglaterra", "league": "EFL League Two", "division": "EFL League Two", "tier": 4, "primary": "#004C99", "secondary": "#FFFFFF", "budgetM": 2, "tm": 1219, "stadium": "SMH Group Stadium", "city": "Chesterfield", "capacity": 10504, "founded": 1866, "coach": "Paul Cook"},
]

# Spain (20 clubs)
SPAIN_CLUBS: list[dict[str, Any]] = [
    {"fc27": "Real Madrid", "name": "Real Madrid", "short": "RMA", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#FFFFFF", "secondary": "#00529F", "budgetM": 160, "tm": 418, "stadium": "Santiago Bernabéu", "city": "Madrid", "capacity": 83186, "founded": 1902, "coach": "Carlo Ancelotti"},
    {"fc27": "FC Barcelona", "name": "FC Barcelona", "short": "BAR", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#004D98", "secondary": "#A50044", "budgetM": 110, "tm": 131, "stadium": "Spotify Camp Nou", "city": "Barcelona", "capacity": 62657, "founded": 1899, "coach": "Hansi Flick"},
    {"fc27": "Atlético de Madrid", "name": "Atlético de Madrid", "short": "ATM", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#CB3524", "secondary": "#272E61", "budgetM": 90, "tm": 13, "stadium": "Riyadh Air Metropolitano", "city": "Madrid", "capacity": 70460, "founded": 1903, "coach": "Diego Simeone"},
    {"fc27": "Athletic Club", "name": "Athletic Club", "short": "ATH", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#EE2524", "secondary": "#FFFFFF", "budgetM": 45, "tm": 621, "stadium": "San Mamés", "city": "Bilbao", "capacity": 53289, "founded": 1898, "coach": "Ernesto Valverde"},
    {"fc27": "Real Sociedad", "name": "Real Sociedad", "short": "RSO", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#0067B1", "secondary": "#FFFFFF", "budgetM": 42, "tm": 681, "stadium": "Reale Arena", "city": "San Sebastián", "capacity": 40000, "founded": 1909, "coach": "Imanol Alguacil"},
    {"fc27": "Real Betis", "name": "Real Betis", "short": "BET", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#009540", "secondary": "#FFFFFF", "budgetM": 35, "tm": 150, "stadium": "Benito Villamarín", "city": "Sevilha", "capacity": 60721, "founded": 1907, "coach": "Manuel Pellegrini"},
    {"fc27": "Villarreal CF", "name": "Villarreal CF", "short": "VIL", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#FEE500", "secondary": "#0055A5", "budgetM": 40, "tm": 1050, "stadium": "Estadio de la Cerámica", "city": "Villarreal", "capacity": 23500, "founded": 1923, "coach": "Marcelino"},
    {"fc27": "Sevilla FC", "name": "Sevilla FC", "short": "SEV", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#FFFFFF", "secondary": "#D4001F", "budgetM": 30, "tm": 368, "stadium": "Ramón Sánchez-Pizjuán", "city": "Sevilha", "capacity": 43883, "founded": 1890, "coach": "García Pimienta"},
    {"fc27": "Valencia CF", "name": "Valencia CF", "short": "VAL", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#FFFFFF", "secondary": "#000000", "budgetM": 28, "tm": 1049, "stadium": "Mestalla", "city": "Valência", "capacity": 49430, "founded": 1919, "coach": "Rubén Baraja"},
    {"fc27": "Celta", "name": "Celta de Vigo", "short": "CEL", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#87CEEB", "secondary": "#FFFFFF", "budgetM": 24, "tm": 940, "stadium": "Abanca Balaídos", "city": "Vigo", "capacity": 22803, "founded": 1923, "coach": "Claudio Giráldez"},
    {"fc27": "CA Osasuna", "name": "CA Osasuna", "short": "OSA", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#DA291C", "secondary": "#001D3D", "budgetM": 22, "tm": 331, "stadium": "El Sadar", "city": "Pamplona", "capacity": 23576, "founded": 1920, "coach": "Vicente Moreno"},
    {"fc27": "Rayo Vallecano", "name": "Rayo Vallecano", "short": "RAY", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#FFFFFF", "secondary": "#E30613", "budgetM": 18, "tm": 367, "stadium": "Vallecas", "city": "Madrid", "capacity": 14708, "founded": 1924, "coach": "Iñigo Pérez"},
    {"fc27": "RCD Espanyol", "name": "RCD Espanyol", "short": "ESP", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#007FC8", "secondary": "#FFFFFF", "budgetM": 20, "tm": 714, "stadium": "RCDE Stadium", "city": "Barcelona", "capacity": 37776, "founded": 1900, "coach": "Manolo González"},
    {"fc27": "D. Alavés", "name": "Deportivo Alavés", "short": "ALA", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#0054A6", "secondary": "#FFFFFF", "budgetM": 18, "tm": 1108, "stadium": "Mendizorroza", "city": "Vitoria-Gasteiz", "capacity": 19840, "founded": 1921, "coach": "Luis García"},
    {"fc27": "Getafe CF", "name": "Getafe CF", "short": "GET", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#00539F", "secondary": "#FFFFFF", "budgetM": 18, "tm": 3709, "stadium": "Coliseum", "city": "Getafe", "capacity": 16800, "founded": 1983, "coach": "José Bordalás"},
    {"fc27": "Levante UD", "name": "Levante UD", "short": "LEV", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#800020", "secondary": "#002B49", "budgetM": 16, "tm": 3368, "stadium": "Ciutat de València", "city": "Valência", "capacity": 26354, "founded": 1909, "coach": "Julián Calero"},
    {"fc27": "Elche CF", "name": "Elche CF", "short": "ELC", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#FFFFFF", "secondary": "#006837", "budgetM": 14, "tm": 1531, "stadium": "Martínez Valero", "city": "Elche", "capacity": 31388, "founded": 1923, "coach": "Eder Sarabia"},
    {"fc27": "Málaga CF", "name": "Málaga CF", "short": "MAL", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#87CEEB", "secondary": "#FFFFFF", "budgetM": 14, "tm": 1084, "stadium": "La Rosaleda", "city": "Málaga", "capacity": 30044, "founded": 1904, "coach": "Sergio Pellicer"},
    {"fc27": "R. Racing Club", "name": "Racing Santander", "short": "RAC", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#008000", "secondary": "#FFFFFF", "budgetM": 12, "tm": 630, "stadium": "El Sardinero", "city": "Santander", "capacity": 22222, "founded": 1913, "coach": "José Alberto"},
    {"fc27": "RC Deportivo", "name": "Deportivo La Coruña", "short": "DEP", "country": "Espanha", "league": "LALIGA EA SPORTS", "division": "LALIGA EA SPORTS", "tier": 1, "primary": "#0054A6", "secondary": "#FFFFFF", "budgetM": 14, "tm": 897, "stadium": "Abanca Riazor", "city": "A Coruña", "capacity": 32912, "founded": 1906, "coach": "Imanol Idiakez"},
]

# Italy (20 clubs)
ITALY_CLUBS: list[dict[str, Any]] = [
    {"fc27": "Milano FC", "name": "Inter de Milão", "short": "INT", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#0068A8", "secondary": "#000000", "budgetM": 120, "tm": 46, "stadium": "San Siro", "city": "Milão", "capacity": 75923, "founded": 1908, "coach": "Simone Inzaghi"},
    {"fc27": "Juventus FC", "name": "Juventus", "short": "JUV", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 115, "tm": 506, "stadium": "Allianz Stadium", "city": "Turim", "capacity": 41507, "founded": 1897, "coach": "Thiago Motta"},
    {"fc27": "Lombardia FC", "name": "AC Milan", "short": "MIL", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#FB090B", "secondary": "#000000", "budgetM": 100, "tm": 5, "stadium": "San Siro", "city": "Milão", "capacity": 75923, "founded": 1899, "coach": "Paulo Fonseca"},
    {"fc27": "SSC Napoli", "name": "Napoli", "short": "NAP", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#12A0D7", "secondary": "#FFFFFF", "budgetM": 95, "tm": 6195, "stadium": "Diego Armando Maradona", "city": "Nápoles", "capacity": 54726, "founded": 1926, "coach": "Antonio Conte"},
    {"fc27": "Bergamo Calcio", "name": "Atalanta", "short": "ATA", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#1E71B8", "secondary": "#000000", "budgetM": 65, "tm": 800, "stadium": "Gewiss Stadium", "city": "Bérgamo", "capacity": 24950, "founded": 1907, "coach": "Gian Piero Gasperini"},
    {"fc27": "AS Roma", "name": "Roma", "short": "ROM", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#8E1F2F", "secondary": "#F0BC42", "budgetM": 70, "tm": 12, "stadium": "Stadio Olimpico", "city": "Roma", "capacity": 70634, "founded": 1927, "coach": "Claudio Ranieri"},
    {"fc27": "SS Lazio", "name": "Lazio", "short": "LAZ", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#87D8F7", "secondary": "#FFFFFF", "budgetM": 55, "tm": 398, "stadium": "Stadio Olimpico", "city": "Roma", "capacity": 70634, "founded": 1900, "coach": "Marco Baroni"},
    {"fc27": "ACF Fiorentina", "name": "Fiorentina", "short": "FIO", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#4F1470", "secondary": "#FFFFFF", "budgetM": 45, "tm": 430, "stadium": "Artemio Franchi", "city": "Florença", "capacity": 43147, "founded": 1926, "coach": "Raffaele Palladino"},
    {"fc27": "Bologna FC", "name": "Bologna", "short": "BOL", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#1A2F50", "secondary": "#9E1B32", "budgetM": 40, "tm": 1025, "stadium": "Renato Dall'Ara", "city": "Bolonha", "capacity": 36462, "founded": 1909, "coach": "Vincenzo Italiano"},
    {"fc27": "Torino FC", "name": "Torino", "short": "TOR", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#8B1E41", "secondary": "#FFFFFF", "budgetM": 35, "tm": 416, "stadium": "Olimpico Grande Torino", "city": "Turim", "capacity": 28177, "founded": 1906, "coach": "Paolo Vanoli"},
    {"fc27": "Como 1907", "name": "Como 1907", "short": "COM", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#003366", "secondary": "#FFFFFF", "budgetM": 38, "tm": 1047, "stadium": "Giuseppe Sinigaglia", "city": "Como", "capacity": 12039, "founded": 1907, "coach": "Cesc Fàbregas"},
    {"fc27": "Genoa CFC", "name": "Genoa", "short": "GEN", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#001D3D", "secondary": "#C8102E", "budgetM": 28, "tm": 252, "stadium": "Luigi Ferraris", "city": "Gênova", "capacity": 34901, "founded": 1893, "coach": "Patrick Vieira"},
    {"fc27": "Parma Calcio", "name": "Parma", "short": "PAR", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#FFFF00", "secondary": "#002B49", "budgetM": 26, "tm": 130, "stadium": "Ennio Tardini", "city": "Parma", "capacity": 22352, "founded": 1913, "coach": "Fabio Pecchia"},
    {"fc27": "Udinese Calcio", "name": "Udinese", "short": "UDI", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 25, "tm": 410, "stadium": "Bluenergy Stadium", "city": "Udine", "capacity": 25144, "founded": 1896, "coach": "Kosta Runjaić"},
    {"fc27": "Cagliari Calcio", "name": "Cagliari", "short": "CAG", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#002B49", "secondary": "#C8102E", "budgetM": 22, "tm": 1390, "stadium": "Unipol Domus", "city": "Cagliari", "capacity": 16416, "founded": 1920, "coach": "Davide Nicola"},
    {"fc27": "AC Monza", "name": "Monza", "short": "MON", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#EE1C25", "secondary": "#FFFFFF", "budgetM": 22, "tm": 2919, "stadium": "U-Power Stadium", "city": "Monza", "capacity": 17102, "founded": 1912, "coach": "Alessandro Nesta"},
    {"fc27": "US Lecce", "name": "Lecce", "short": "LEC", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#FFF200", "secondary": "#DA291C", "budgetM": 18, "tm": 1005, "stadium": "Via del Mare", "city": "Lecce", "capacity": 31559, "founded": 1908, "coach": "Marco Giampaolo"},
    {"fc27": "Venezia FC", "name": "Venezia", "short": "VEN", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#FF671F", "secondary": "#007A33", "budgetM": 18, "tm": 607, "stadium": "Pier Luigi Penzo", "city": "Veneza", "capacity": 12048, "founded": 1907, "coach": "Eusebio Di Francesco"},
    {"fc27": "Sassuolo", "name": "Sassuolo", "short": "SAS", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#00843D", "secondary": "#000000", "budgetM": 24, "tm": 6574, "stadium": "Mapei Stadium", "city": "Reggio Emilia", "capacity": 21584, "founded": 1920, "coach": "Fabio Grosso"},
    {"fc27": "Frosinone Calcio", "name": "Frosinone", "short": "FRO", "country": "Itália", "league": "Serie A Enilive", "division": "Serie A Enilive", "tier": 1, "primary": "#FED100", "secondary": "#0054A6", "budgetM": 16, "tm": 8970, "stadium": "Benito Stirpe", "city": "Frosinone", "capacity": 16227, "founded": 1906, "coach": "Leandro Greco"},
]

# Germany (18 clubs)
GERMANY_CLUBS: list[dict[str, Any]] = [
    {"fc27": "FC Bayern München", "name": "Bayern de Munique", "short": "BAY", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#DC052D", "secondary": "#0066B2", "budgetM": 150, "tm": 27, "stadium": "Allianz Arena", "city": "Munique", "capacity": 75000, "founded": 1900, "coach": "Vincent Kompany"},
    {"fc27": "Leverkusen", "name": "Bayer Leverkusen", "short": "B04", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#E32221", "secondary": "#000000", "budgetM": 90, "tm": 15, "stadium": "BayArena", "city": "Leverkusen", "capacity": 30210, "founded": 1904, "coach": "Xabi Alonso"},
    {"fc27": "Borussia Dortmund", "name": "Borussia Dortmund", "short": "BVB", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#FDE100", "secondary": "#000000", "budgetM": 95, "tm": 16, "stadium": "Signal Iduna Park", "city": "Dortmund", "capacity": 81365, "founded": 1909, "coach": "Nuri Şahin"},
    {"fc27": "RB Leipzig", "name": "RB Leipzig", "short": "RBL", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#DA021D", "secondary": "#FFFFFF", "budgetM": 80, "tm": 23826, "stadium": "Red Bull Arena", "city": "Leipzig", "capacity": 47069, "founded": 2009, "coach": "Marco Rose"},
    {"fc27": "Frankfurt", "name": "Eintracht Frankfurt", "short": "SGE", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#E1000F", "secondary": "#000000", "budgetM": 55, "tm": 24, "stadium": "Deutsche Bank Park", "city": "Frankfurt", "capacity": 58000, "founded": 1899, "coach": "Dino Toppmöller"},
    {"fc27": "VfB Stuttgart", "name": "VfB Stuttgart", "short": "VFB", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#FFFFFF", "secondary": "#E32219", "budgetM": 50, "tm": 79, "stadium": "MHP Arena", "city": "Stuttgart", "capacity": 60449, "founded": 1893, "coach": "Sebastian Hoeneß"},
    {"fc27": "M'gladbach", "name": "Borussia Mönchengladbach", "short": "BMG", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#FFFFFF", "secondary": "#000000", "budgetM": 35, "tm": 18, "stadium": "Borussia-Park", "city": "Mönchengladbach", "capacity": 54042, "founded": 1900, "coach": "Gerardo Seoane"},
    {"fc27": "SC Freiburg", "name": "SC Freiburg", "short": "SCF", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#D11218", "secondary": "#000000", "budgetM": 34, "tm": 60, "stadium": "Europa-Park Stadion", "city": "Freiburg", "capacity": 34700, "founded": 1904, "coach": "Julian Schuster"},
    {"fc27": "TSG Hoffenheim", "name": "TSG Hoffenheim", "short": "TSG", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#1961B5", "secondary": "#FFFFFF", "budgetM": 35, "tm": 533, "stadium": "PreZero Arena", "city": "Sinsheim", "capacity": 30150, "founded": 1899, "coach": "Christian Ilzer"},
    {"fc27": "SV Werder Bremen", "name": "Werder Bremen", "short": "SVW", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#1B7340", "secondary": "#FFFFFF", "budgetM": 28, "tm": 86, "stadium": "Weserstadion", "city": "Bremen", "capacity": 42100, "founded": 1899, "coach": "Ole Werner"},
    {"fc27": "Union Berlin", "name": "Union Berlin", "short": "FCU", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#EE1B24", "secondary": "#FFFFFF", "budgetM": 30, "tm": 89, "stadium": "An der Alten Försterei", "city": "Berlim", "capacity": 22012, "founded": 1966, "coach": "Bo Svensson"},
    {"fc27": "FC Augsburg", "name": "FC Augsburg", "short": "FCA", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#BA3733", "secondary": "#FFFFFF", "budgetM": 25, "tm": 167, "stadium": "WWK Arena", "city": "Augsburg", "capacity": 30660, "founded": 1907, "coach": "Jess Thorup"},
    {"fc27": "1. FSV Mainz 05", "name": "Mainz 05", "short": "M05", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#C50F1C", "secondary": "#FFFFFF", "budgetM": 26, "tm": 39, "stadium": "MEWA Arena", "city": "Mainz", "capacity": 33305, "founded": 1905, "coach": "Bo Henriksen"},
    {"fc27": "1. FC Köln", "name": "FC Köln", "short": "KOE", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#ED1C24", "secondary": "#FFFFFF", "budgetM": 28, "tm": 3, "stadium": "RheinEnergieStadion", "city": "Colônia", "capacity": 50000, "founded": 1948, "coach": "Gerhard Struber"},
    {"fc27": "Hamburger SV", "name": "Hamburger SV", "short": "HSV", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#005CA9", "secondary": "#000000", "budgetM": 25, "tm": 41, "stadium": "Volksparkstadion", "city": "Hamburgo", "capacity": 57000, "founded": 1887, "coach": "Steffen Baumgart"},
    {"fc27": "FC Schalke 04", "name": "Schalke 04", "short": "S04", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#004D9D", "secondary": "#FFFFFF", "budgetM": 22, "tm": 33, "stadium": "Veltins-Arena", "city": "Gelsenkirchen", "capacity": 62271, "founded": 1904, "coach": "Kees van Wonderen"},
    {"fc27": "SC Paderborn 07", "name": "SC Paderborn", "short": "SCP", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#005BA8", "secondary": "#000000", "budgetM": 15, "tm": 127, "stadium": "Home Deluxe Arena", "city": "Paderborn", "capacity": 15000, "founded": 1907, "coach": "Lukas Kwasniok"},
    {"fc27": "SV Elversberg", "name": "SV Elversberg", "short": "ELV", "country": "Alemanha", "league": "Bundesliga", "division": "Bundesliga", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 12, "tm": 1083, "stadium": "Ursapharm-Arena", "city": "Spiesen-Elversberg", "capacity": 10000, "founded": 1907, "coach": "Horst Steffen"},
]

# France (18 clubs)
FRANCE_CLUBS: list[dict[str, Any]] = [
    {"fc27": "PSG", "name": "Paris Saint-Germain", "short": "PSG", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#004170", "secondary": "#DA291C", "budgetM": 150, "tm": 583, "stadium": "Parc des Princes", "city": "Paris", "capacity": 48583, "founded": 1970, "coach": "Luis Enrique"},
    {"fc27": "AS Monaco", "name": "AS Monaco", "short": "ASM", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#E2001A", "secondary": "#FFFFFF", "budgetM": 75, "tm": 162, "stadium": "Stade Louis II", "city": "Monaco", "capacity": 18523, "founded": 1924, "coach": "Adi Hütter"},
    {"fc27": "OM", "name": "Olympique de Marseille", "short": "OM", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#00A3E0", "secondary": "#FFFFFF", "budgetM": 70, "tm": 244, "stadium": "Orange Vélodrome", "city": "Marselha", "capacity": 67394, "founded": 1899, "coach": "Roberto De Zerbi"},
    {"fc27": "OL", "name": "Olympique Lyonnais", "short": "OL", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#002F6C", "secondary": "#DA291C", "budgetM": 60, "tm": 1041, "stadium": "Groupama Stadium", "city": "Lyon", "capacity": 59186, "founded": 1950, "coach": "Pierre Sage"},
    {"fc27": "LOSC", "name": "Lille OSC", "short": "LOSC", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#E01E13", "secondary": "#11224D", "budgetM": 55, "tm": 1082, "stadium": "Decathlon Arena", "city": "Lille", "capacity": 50186, "founded": 1944, "coach": "Bruno Génésio"},
    {"fc27": "OGC Nice", "name": "OGC Nice", "short": "NICE", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#E30613", "secondary": "#000000", "budgetM": 45, "tm": 417, "stadium": "Allianz Riviera", "city": "Nice", "capacity": 36178, "founded": 1904, "coach": "Franck Haise"},
    {"fc27": "RC Lens", "name": "RC Lens", "short": "RCL", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#FFDF00", "secondary": "#DA291C", "budgetM": 40, "tm": 826, "stadium": "Bollaert-Delelis", "city": "Lens", "capacity": 38223, "founded": 1906, "coach": "Will Still"},
    {"fc27": "Stade Rennais FC", "name": "Rennes", "short": "REN", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#E30613", "secondary": "#000000", "budgetM": 45, "tm": 273, "stadium": "Roazhon Park", "city": "Rennes", "capacity": 29778, "founded": 1901, "coach": "Jorge Sampaoli"},
    {"fc27": "Stade Brestois 29", "name": "Brest", "short": "SB29", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#DA291C", "secondary": "#FFFFFF", "budgetM": 35, "tm": 3911, "stadium": "Francis-Le Blé", "city": "Brest", "capacity": 15220, "founded": 1950, "coach": "Éric Roy"},
    {"fc27": "Strasbourg", "name": "Strasbourg", "short": "RCSA", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#0072BC", "secondary": "#FFFFFF", "budgetM": 38, "tm": 667, "stadium": "Meinau", "city": "Estrasburgo", "capacity": 26109, "founded": 1906, "coach": "Liam Rosenior"},
    {"fc27": "Toulouse FC", "name": "Toulouse", "short": "TFC", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#4F2683", "secondary": "#FFFFFF", "budgetM": 25, "tm": 1019, "stadium": "Stadium de Toulouse", "city": "Toulouse", "capacity": 33150, "founded": 1937, "coach": "Carles Martínez"},
    {"fc27": "Paris FC", "name": "Paris FC", "short": "PFC", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#002B49", "secondary": "#FFFFFF", "budgetM": 30, "tm": 10004, "stadium": "Stade Charléty", "city": "Paris", "capacity": 20000, "founded": 1969, "coach": "Stéphane Gilli"},
    {"fc27": "AJ Auxerre", "name": "Auxerre", "short": "AJA", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#FFFFFF", "secondary": "#005CA9", "budgetM": 20, "tm": 290, "stadium": "Abbé-Deschamps", "city": "Auxerre", "capacity": 18541, "founded": 1905, "coach": "Christophe Pélissier"},
    {"fc27": "Angers SCO", "name": "Angers", "short": "SCO", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 18, "tm": 1420, "stadium": "Raymond Kopa", "city": "Angers", "capacity": 18752, "founded": 1919, "coach": "Alexandre Dujeux"},
    {"fc27": "Havre AC", "name": "Le Havre", "short": "HAC", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#87CEEB", "secondary": "#002B49", "budgetM": 18, "tm": 738, "stadium": "Stade Océane", "city": "Le Havre", "capacity": 25178, "founded": 1872, "coach": "Didier Digard"},
    {"fc27": "FC Lorient", "name": "Lorient", "short": "FCL", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#FF6600", "secondary": "#000000", "budgetM": 20, "tm": 1158, "stadium": "Moustoir", "city": "Lorient", "capacity": 18110, "founded": 1926, "coach": "Olivier Pantaloni"},
    {"fc27": "ESTAC Troyes", "name": "Troyes", "short": "EST", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#0055A5", "secondary": "#FFFFFF", "budgetM": 15, "tm": 1095, "stadium": "Stade de l'Aube", "city": "Troyes", "capacity": 20400, "founded": 1986, "coach": "Stéphane Dumont"},
    {"fc27": "Le Mans FC", "name": "Le Mans", "short": "LEM", "country": "França", "league": "Ligue 1 McDonald's", "division": "Ligue 1 McDonald's", "tier": 1, "primary": "#E30613", "secondary": "#FFCC00", "budgetM": 12, "tm": 969, "stadium": "Marie-Marvingt", "city": "Le Mans", "capacity": 25064, "founded": 1985, "coach": "Patrick Videira"},
]

# Saudi Arabia (16 clubs)
SAUDI_CLUBS: list[dict[str, Any]] = [
    {"fc27": "Al Hilal", "name": "Al Hilal", "short": "HIL", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#004B93", "secondary": "#FFFFFF", "budgetM": 140, "tm": 1114, "stadium": "Kingdom Arena", "city": "Riade", "capacity": 30000, "founded": 1957, "coach": "Jorge Jesus"},
    {"fc27": "Al Nassr", "name": "Al Nassr", "short": "NAS", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#FFCE00", "secondary": "#0047AB", "budgetM": 125, "tm": 18544, "stadium": "Al-Awwal Park", "city": "Riade", "capacity": 25000, "founded": 1955, "coach": "Stefano Pioli"},
    {"fc27": "Al Ittihad", "name": "Al Ittihad", "short": "ITT", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#FED100", "secondary": "#000000", "budgetM": 110, "tm": 8023, "stadium": "King Abdullah Sports City", "city": "Jidá", "capacity": 62345, "founded": 1927, "coach": "Laurent Blanc"},
    {"fc27": "Al Ahli", "name": "Al Ahli", "short": "AHL", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#007A3D", "secondary": "#FFFFFF", "budgetM": 90, "tm": 18487, "stadium": "King Abdullah Sports City", "city": "Jidá", "capacity": 62345, "founded": 1937, "coach": "Matthias Jaissle"},
    {"fc27": "Al Qadsiah", "name": "Al Qadsiah", "short": "QAD", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#C8102E", "secondary": "#FFCD00", "budgetM": 75, "tm": 26069, "stadium": "Prince Saud bin Jalawi", "city": "Khobar", "capacity": 15000, "founded": 1967, "coach": "Míchel"},
    {"fc27": "Al Ettifaq", "name": "Al Ettifaq", "short": "ETT", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#006837", "secondary": "#C8102E", "budgetM": 50, "tm": 7732, "stadium": "Al-Ettifaq Club Stadium", "city": "Dammam", "capacity": 15000, "founded": 1945, "coach": "Steven Gerrard"},
    {"fc27": "Al Shabab", "name": "Al Shabab", "short": "SHB", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 45, "tm": 9128, "stadium": "Al-Shabab Club Stadium", "city": "Riade", "capacity": 15000, "founded": 1947, "coach": "Vítor Pereira"},
    {"fc27": "Al Taawoun", "name": "Al Taawoun", "short": "TAA", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#FED100", "secondary": "#002B49", "budgetM": 30, "tm": 28844, "stadium": "King Abdullah Sport City", "city": "Buraidah", "capacity": 25000, "founded": 1956, "coach": "Rodolfo Arruabarrena"},
    {"fc27": "Al Fateh", "name": "Al Fateh", "short": "FAT", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#0047AB", "secondary": "#007A3D", "budgetM": 25, "tm": 27221, "stadium": "Al-Fateh Club Stadium", "city": "Al-Hasa", "capacity": 12000, "founded": 1958, "coach": "Jens Gustafsson"},
    {"fc27": "Al Fayha", "name": "Al Fayha", "short": "FAY", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#FF671F", "secondary": "#002B49", "budgetM": 22, "tm": 50531, "stadium": "Al-Majma'ah Sports City", "city": "Al-Majma'ah", "capacity": 7000, "founded": 1953, "coach": "Christos Kontis"},
    {"fc27": "Al Riyadh", "name": "Al Riyadh", "short": "RIY", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#E30613", "secondary": "#000000", "budgetM": 20, "tm": 31008, "stadium": "Prince Turki bin Abdul Aziz", "city": "Riade", "capacity": 15000, "founded": 1953, "coach": "Sabri Lamouchi"},
    {"fc27": "Al Khaleej", "name": "Al Khaleej", "short": "KHL", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#006837", "secondary": "#FFCD00", "budgetM": 20, "tm": 6070, "stadium": "Prince Mohamed bin Fahd", "city": "Saihat", "capacity": 35000, "founded": 1945, "coach": "Georgios Donis"},
    {"fc27": "Al Kholood", "name": "Al Kholood", "short": "KHO", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 18, "tm": 91427, "stadium": "Al-Hazem Club Stadium", "city": "Ar Rass", "capacity": 8000, "founded": 1970, "coach": "Noureddine Zekri"},
    {"fc27": "Al Hazem", "name": "Al Hazem", "short": "HAZ", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#FFCD00", "secondary": "#002B49", "budgetM": 18, "tm": 9131, "stadium": "Al-Hazem Club Stadium", "city": "Ar Rass", "capacity": 8000, "founded": 1957, "coach": "Daniel Carreño"},
    {"fc27": "Al Faisaly", "name": "Al Faisaly", "short": "FAI", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#800020", "secondary": "#FFFFFF", "budgetM": 15, "tm": 18545, "stadium": "Al-Majma'ah Sports City", "city": "Harmah", "capacity": 7000, "founded": 1954, "coach": "Filipe Gouveia"},
    {"fc27": "Abha", "name": "Abha", "short": "ABH", "country": "Arábia Saudita", "league": "ROSHN Saudi League", "division": "ROSHN Saudi League", "tier": 1, "primary": "#C8102E", "secondary": "#002B49", "budgetM": 15, "tm": 23628, "stadium": "Prince Sultan bin Abdul Aziz", "city": "Abha", "capacity": 20000, "founded": 1966, "coach": "George Timotheou"},
]

# Brazil (20 clubs from TM)
BRAZIL_CLUBS: list[dict[str, Any]] = [
    {"tm_name": "Clube de Regatas do Flamengo", "name": "Flamengo", "short": "FLA", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#C8102E", "secondary": "#000000", "budgetM": 45, "tm": 614, "stadium": "Maracanã", "city": "Rio de Janeiro", "capacity": 78838, "founded": 1895, "coach": "Filipe Luís"},
    {"tm_name": "Sociedade Esportiva Palmeiras", "name": "Palmeiras", "short": "PAL", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#006437", "secondary": "#FFFFFF", "budgetM": 42, "tm": 1023, "stadium": "Allianz Parque", "city": "São Paulo", "capacity": 43713, "founded": 1914, "coach": "Abel Ferreira"},
    {"tm_name": "São Paulo Futebol Clube", "name": "São Paulo", "short": "SAO", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#FE0000", "secondary": "#000000", "budgetM": 28, "tm": 585, "stadium": "MorumBIS", "city": "São Paulo", "capacity": 66795, "founded": 1930, "coach": "Luis Zubeldía"},
    {"tm_name": "Sport Club Corinthians Paulista", "name": "Corinthians", "short": "COR", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 26, "tm": 199, "stadium": "Neo Química Arena", "city": "São Paulo", "capacity": 49205, "founded": 1910, "coach": "Ramón Díaz"},
    {"tm_name": "Fluminense Football Club", "name": "Fluminense", "short": "FLU", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#800020", "secondary": "#006437", "budgetM": 25, "tm": 2462, "stadium": "Maracanã", "city": "Rio de Janeiro", "capacity": 78838, "founded": 1902, "coach": "Mano Menezes"},
    {"tm_name": "S. A. F. Botafogo", "name": "Botafogo", "short": "BOT", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 35, "tm": 537, "stadium": "Nilton Santos", "city": "Rio de Janeiro", "capacity": 44661, "founded": 1904, "coach": "Artur Jorge"},
    {"tm_name": "Grêmio Foot-Ball Porto Alegrense", "name": "Grêmio", "short": "GRE", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#0D80BF", "secondary": "#000000", "budgetM": 24, "tm": 210, "stadium": "Arena do Grêmio", "city": "Porto Alegre", "capacity": 55662, "founded": 1903, "coach": "Renato Gaúcho"},
    {"tm_name": "Sport Club Internacional", "name": "Internacional", "short": "INT", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 26, "tm": 6600, "stadium": "Beira-Rio", "city": "Porto Alegre", "capacity": 50128, "founded": 1909, "coach": "Roger Machado"},
    {"tm_name": "Clube Atlético Mineiro", "name": "Atlético Mineiro", "short": "CAM", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 30, "tm": 330, "stadium": "Arena MRV", "city": "Belo Horizonte", "capacity": 46000, "founded": 1908, "coach": "Gabriel Milito"},
    {"tm_name": "Cruzeiro Esporte Clube", "name": "Cruzeiro", "short": "CRU", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#003A70", "secondary": "#FFFFFF", "budgetM": 32, "tm": 609, "stadium": "Mineirão", "city": "Belo Horizonte", "capacity": 61846, "founded": 1921, "coach": "Fernando Diniz"},
    {"tm_name": "Club de Regatas Vasco da Gama", "name": "Vasco da Gama", "short": "VAS", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 22, "tm": 978, "stadium": "São Januário", "city": "Rio de Janeiro", "capacity": 21880, "founded": 1898, "coach": "Rafael Paiva"},
    {"tm_name": "Esporte Clube Bahia", "name": "Bahia", "short": "BAH", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#002B49", "secondary": "#C8102E", "budgetM": 28, "tm": 10010, "stadium": "Arena Fonte Nova", "city": "Salvador", "capacity": 47907, "founded": 1931, "coach": "Rogério Ceni"},
    {"tm_name": "Fortaleza Esporte Clube", "name": "Fortaleza", "short": "FOR", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#002B49", "secondary": "#C8102E", "budgetM": 22, "tm": 10870, "stadium": "Castelão", "city": "Fortaleza", "capacity": 63904, "founded": 1918, "coach": "Juan Pablo Vojvoda"},
    {"tm_name": "Clube Atlético Paranaense", "name": "Athletico Paranaense", "short": "CAP", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#C8102E", "secondary": "#000000", "budgetM": 25, "tm": 679, "stadium": "Ligga Arena", "city": "Curitiba", "capacity": 42370, "founded": 1924, "coach": "Lucho González"},
    {"tm_name": "Red Bull Bragantino", "name": "Red Bull Bragantino", "short": "RBB", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#FFFFFF", "secondary": "#C8102E", "budgetM": 24, "tm": 8793, "stadium": "Nabi Abi Chedid", "city": "Bragança Paulista", "capacity": 17128, "founded": 1928, "coach": "Fernando Seabra"},
    {"tm_name": "Santos Futebol Clube", "name": "Santos", "short": "SAN", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 22, "tm": 221, "stadium": "Vila Belmiro", "city": "Santos", "capacity": 16068, "founded": 1912, "coach": "Leandro Zago"},
    {"tm_name": "Esporte Clube Vitória", "name": "Vitória", "short": "VIT", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#C8102E", "secondary": "#000000", "budgetM": 16, "tm": 2125, "stadium": "Barradão", "city": "Salvador", "capacity": 30793, "founded": 1899, "coach": "Thiago Carpini"},
    {"tm_name": "Esporte Clube Juventude", "name": "Juventude", "short": "JUV", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#006437", "secondary": "#FFFFFF", "budgetM": 14, "tm": 10492, "stadium": "Alfredo Jaconi", "city": "Caxias do Sul", "capacity": 19924, "founded": 1913, "coach": "Fábio Matias"},
    {"tm_name": "Sport Club do Recife", "name": "Sport Recife", "short": "SPO", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#C8102E", "secondary": "#000000", "budgetM": 16, "tm": 8718, "stadium": "Ilha do Retiro", "city": "Recife", "capacity": 32983, "founded": 1905, "coach": "Pepa"},
    {"tm_name": "Ceará Sporting Club", "name": "Ceará", "short": "CEA", "country": "Brasil", "league": "Brasileirão Série A", "division": "Brasileirão Série A", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 15, "tm": 2029, "stadium": "Castelão", "city": "Fortaleza", "capacity": 63904, "founded": 1914, "coach": "Léo Condé"},
]

# Portugal (16 clubs)
PORTUGAL_CLUBS: list[dict[str, Any]] = [
    {"fc27": "SL Benfica", "name": "SL Benfica", "short": "SLB", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 65, "tm": 294, "stadium": "Estádio da Luz", "city": "Lisboa", "capacity": 64642, "founded": 1904, "coach": "Bruno Lage"},
    {"fc27": "Sporting CP", "name": "Sporting CP", "short": "SCP", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#008057", "secondary": "#FFFFFF", "budgetM": 60, "tm": 336, "stadium": "José Alvalade", "city": "Lisboa", "capacity": 50095, "founded": 1906, "coach": "João Pereira"},
    {"fc27": "FC Porto", "name": "FC Porto", "short": "FCP", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#002B49", "secondary": "#FFFFFF", "budgetM": 55, "tm": 277, "stadium": "Estádio do Dragão", "city": "Porto", "capacity": 50033, "founded": 1893, "coach": "Vítor Bruno"},
    {"fc27": "SC Braga", "name": "SC Braga", "short": "SCB", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 35, "tm": 1075, "stadium": "Municipal de Braga", "city": "Braga", "capacity": 30286, "founded": 1921, "coach": "Carlos Carvalhal"},
    {"fc27": "Vitória SC", "name": "Vitória SC", "short": "VSC", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#FFFFFF", "secondary": "#000000", "budgetM": 20, "tm": 2420, "stadium": "D. Afonso Henriques", "city": "Guimarães", "capacity": 30008, "founded": 1922, "coach": "Rui Borges"},
    {"fc27": "FC Famalicão", "name": "FC Famalicão", "short": "FAM", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#002B49", "secondary": "#FFFFFF", "budgetM": 16, "tm": 2429, "stadium": "Municipal de Famalicão", "city": "Famalicão", "capacity": 5307, "founded": 1931, "coach": "Armando Evangelista"},
    {"fc27": "Rio Ave FC", "name": "Rio Ave", "short": "RAV", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#006437", "secondary": "#FFFFFF", "budgetM": 14, "tm": 2425, "stadium": "Estádio dos Arcos", "city": "Vila do Conde", "capacity": 5300, "founded": 1939, "coach": "Petit"},
    {"fc27": "Estoril Praia", "name": "Estoril Praia", "short": "EST", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#FFCC00", "secondary": "#002B49", "budgetM": 12, "tm": 1465, "stadium": "António Coimbra da Mota", "city": "Estoril", "capacity": 8015, "founded": 1939, "coach": "Ian Cathro"},
    {"fc27": "Gil Vicente", "name": "Gil Vicente", "short": "GVI", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#E30613", "secondary": "#002B49", "budgetM": 12, "tm": 2424, "stadium": "Cidade de Barcelos", "city": "Barcelos", "capacity": 12504, "founded": 1924, "coach": "Bruno Pinheiro"},
    {"fc27": "Casa Pia AC", "name": "Casa Pia AC", "short": "CAS", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 11, "tm": 3514, "stadium": "Pina Manique", "city": "Lisboa", "capacity": 2574, "founded": 1920, "coach": "João Pereira"},
    {"fc27": "Arouca", "name": "Arouca", "short": "ARO", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#FFCC00", "secondary": "#002B49", "budgetM": 11, "tm": 8024, "stadium": "Municipal de Arouca", "city": "Arouca", "capacity": 5600, "founded": 1951, "coach": "Vasco Seabra"},
    {"fc27": "Moreirense FC", "name": "Moreirense", "short": "MOR", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#006437", "secondary": "#FFFFFF", "budgetM": 11, "tm": 979, "stadium": "Joaquim Almeida Freitas", "city": "Moreira de Cónegos", "capacity": 6153, "founded": 1938, "coach": "César Peixoto"},
    {"fc27": "Santa Clara", "name": "Santa Clara", "short": "SCL", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 10, "tm": 2423, "stadium": "São Miguel", "city": "Ponta Delgada", "capacity": 12500, "founded": 1927, "coach": "Vasco Matos"},
    {"fc27": "Nacional", "name": "Nacional", "short": "NAC", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 9, "tm": 982, "stadium": "Estádio da Madeira", "city": "Funchal", "capacity": 5200, "founded": 1910, "coach": "Tiago Margarido"},
    {"fc27": "Estrela Amadora", "name": "Estrela Amadora", "short": "EAM", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 9, "tm": 2431, "stadium": "José Gomes", "city": "Amadora", "capacity": 9288, "founded": 1932, "coach": "José Faria"},
    {"fc27": "FC Alverca", "name": "FC Alverca", "short": "ALV", "country": "Portugal", "league": "Liga Portugal", "division": "Liga Portugal", "tier": 1, "primary": "#002B49", "secondary": "#C8102E", "budgetM": 8, "tm": 2434, "stadium": "Complexo do Alverca", "city": "Alverca", "capacity": 7705, "founded": 1939, "coach": "Custódio"},
]

# Netherlands (16 clubs)
NETHERLANDS_CLUBS: list[dict[str, Any]] = [
    {"fc27": "Ajax", "name": "Ajax", "short": "AJA", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#D2122E", "secondary": "#FFFFFF", "budgetM": 60, "tm": 610, "stadium": "Johan Cruijff ArenA", "city": "Amsterdam", "capacity": 55885, "founded": 1900, "coach": "Francesco Farioli"},
    {"fc27": "PSV", "name": "PSV", "short": "PSV", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#ED1C24", "secondary": "#FFFFFF", "budgetM": 65, "tm": 383, "stadium": "Philips Stadion", "city": "Eindhoven", "capacity": 35000, "founded": 1913, "coach": "Peter Bosz"},
    {"fc27": "Feyenoord", "name": "Feyenoord", "short": "FEY", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 55, "tm": 234, "stadium": "De Kuip", "city": "Rotterdam", "capacity": 47500, "founded": 1908, "coach": "Brian Priske"},
    {"fc27": "AZ", "name": "AZ Alkmaar", "short": "AZ", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#DA291C", "secondary": "#FFFFFF", "budgetM": 35, "tm": 1090, "stadium": "AFAS Stadion", "city": "Alkmaar", "capacity": 19478, "founded": 1967, "coach": "Maarten Martens"},
    {"fc27": "FC Twente", "name": "FC Twente", "short": "TWE", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 30, "tm": 322, "stadium": "De Grolsch Veste", "city": "Enschede", "capacity": 30205, "founded": 1965, "coach": "Joseph Oosting"},
    {"fc27": "FC Utrecht", "name": "FC Utrecht", "short": "UTR", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 24, "tm": 200, "stadium": "Stadion Galgenwaard", "city": "Utrecht", "capacity": 23750, "founded": 1970, "coach": "Ron Jans"},
    {"fc27": "sc Heerenveen", "name": "Heerenveen", "short": "HEE", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#003399", "secondary": "#FFFFFF", "budgetM": 18, "tm": 306, "stadium": "Abe Lenstra Stadion", "city": "Heerenveen", "capacity": 26100, "founded": 1920, "coach": "Robin van Persie"},
    {"fc27": "Sparta Rotterdam", "name": "Sparta Rotterdam", "short": "SPA", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 16, "tm": 468, "stadium": "Het Kasteel", "city": "Rotterdam", "capacity": 11000, "founded": 1888, "coach": "Jeroen Rijsdijk"},
    {"fc27": "Go Ahead Eagles", "name": "Go Ahead Eagles", "short": "GAE", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#E30613", "secondary": "#FFCC00", "budgetM": 15, "tm": 1435, "stadium": "De Adelaarshorst", "city": "Deventer", "capacity": 10400, "founded": 1902, "coach": "Paul Simonis"},
    {"fc27": "N.E.C. Nijmegen", "name": "N.E.C. Nijmegen", "short": "NEC", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#E30613", "secondary": "#006437", "budgetM": 15, "tm": 467, "stadium": "Goffertstadion", "city": "Nijmegen", "capacity": 12500, "founded": 1900, "coach": "Rogier Meijer"},
    {"fc27": "Fortuna Sittard", "name": "Fortuna Sittard", "short": "FOR", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#006437", "secondary": "#FFCC00", "budgetM": 12, "tm": 385, "stadium": "Fortuna Sittard Stadion", "city": "Sittard", "capacity": 12500, "founded": 1968, "coach": "Danny Buijs"},
    {"fc27": "PEC Zwolle", "name": "PEC Zwolle", "short": "ZWO", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#003399", "secondary": "#FFFFFF", "budgetM": 12, "tm": 1269, "stadium": "MAC³PARK Stadion", "city": "Zwolle", "capacity": 14000, "founded": 1910, "coach": "Johnny Jansen"},
    {"fc27": "Willem II", "name": "Willem II", "short": "WIL", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#002B49", "secondary": "#E30613", "budgetM": 12, "tm": 403, "stadium": "Koning Willem II Stadion", "city": "Tilburg", "capacity": 14750, "founded": 1896, "coach": "Peter Maes"},
    {"fc27": "FC Groningen", "name": "FC Groningen", "short": "GRO", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#006437", "secondary": "#FFFFFF", "budgetM": 14, "tm": 202, "stadium": "Euroborg", "city": "Groningen", "capacity": 22550, "founded": 1971, "coach": "Dick Lukkien"},
    {"fc27": "Excelsior", "name": "Excelsior", "short": "EXC", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#000000", "secondary": "#E30613", "budgetM": 10, "tm": 798, "stadium": "Van Donge & De Roo", "city": "Rotterdam", "capacity": 4500, "founded": 1902, "coach": "Ruben den Uil"},
    {"fc27": "SC Cambuur", "name": "SC Cambuur", "short": "CAM", "country": "Holanda", "league": "Eredivisie", "division": "Eredivisie", "tier": 1, "primary": "#FFCC00", "secondary": "#002B49", "budgetM": 10, "tm": 1284, "stadium": "Kooi Stadion", "city": "Leeuwarden", "capacity": 15000, "founded": 1964, "coach": "Henk de Jong"},
]

# USA (20 clubs)
MLS_CLUBS: list[dict[str, Any]] = [
    {"fc27": "Inter Miami CF", "name": "Inter Miami", "short": "MIA", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#F7B5CD", "secondary": "#231F20", "budgetM": 60, "tm": 69261, "stadium": "Chase Stadium", "city": "Fort Lauderdale", "capacity": 21550, "founded": 2018, "coach": "Gerardo Martino"},
    {"fc27": "LA Galaxy", "name": "LA Galaxy", "short": "LAG", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#00245D", "secondary": "#EEB111", "budgetM": 45, "tm": 1230, "stadium": "Dignity Health Sports Park", "city": "Carson", "capacity": 27000, "founded": 1994, "coach": "Greg Vanney"},
    {"fc27": "LAFC", "name": "Los Angeles FC", "short": "LAFC", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#C39E5C", "secondary": "#000000", "budgetM": 45, "tm": 51828, "stadium": "BMO Stadium", "city": "Los Angeles", "capacity": 22000, "founded": 2014, "coach": "Steve Cherundolo"},
    {"fc27": "Columbus Crew", "name": "Columbus Crew", "short": "CLB", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#FEDD00", "secondary": "#000000", "budgetM": 40, "tm": 813, "stadium": "Lower.com Field", "city": "Columbus", "capacity": 20371, "founded": 1994, "coach": "Wilfried Nancy"},
    {"fc27": "Atlanta United", "name": "Atlanta United", "short": "ATL", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#80000A", "secondary": "#221F1F", "budgetM": 42, "tm": 51663, "stadium": "Mercedes-Benz Stadium", "city": "Atlanta", "capacity": 42500, "founded": 2014, "coach": "Rob Valentino"},
    {"fc27": "Sounders FC", "name": "Seattle Sounders", "short": "SEA", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#005595", "secondary": "#5D9741", "budgetM": 35, "tm": 9636, "stadium": "Lumen Field", "city": "Seattle", "capacity": 37722, "founded": 2007, "coach": "Brian Schmetzer"},
    {"fc27": "New York City FC", "name": "New York City FC", "short": "NYC", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#6CACE4", "secondary": "#041E42", "budgetM": 38, "tm": 40058, "stadium": "Yankee Stadium", "city": "New York", "capacity": 28743, "founded": 2013, "coach": "Nick Cushing"},
    {"fc27": "Red Bulls", "name": "New York Red Bulls", "short": "NYRB", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#ED1E36", "secondary": "#221F1F", "budgetM": 35, "tm": 623, "stadium": "Red Bull Arena", "city": "Harrison", "capacity": 25000, "founded": 1994, "coach": "Sandro Schwarz"},
    {"fc27": "FC Cincinnati", "name": "FC Cincinnati", "short": "CIN", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#FE5000", "secondary": "#001A9C", "budgetM": 35, "tm": 51772, "stadium": "TQL Stadium", "city": "Cincinnati", "capacity": 26000, "founded": 2018, "coach": "Pat Noonan"},
    {"fc27": "Orlando City", "name": "Orlando City", "short": "ORL", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#612B82", "secondary": "#FFE169", "budgetM": 32, "tm": 45604, "stadium": "Inter&Co Stadium", "city": "Orlando", "capacity": 25500, "founded": 2013, "coach": "Óscar Pareja"},
    {"fc27": "Philadelphia", "name": "Philadelphia Union", "short": "PHI", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#041E42", "secondary": "#B1872D", "budgetM": 30, "tm": 25467, "stadium": "Subaru Park", "city": "Chester", "capacity": 18500, "founded": 2008, "coach": "Jim Curtin"},
    {"fc27": "Portland Timbers", "name": "Portland Timbers", "short": "POR", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#00482B", "secondary": "#EAE827", "budgetM": 30, "tm": 25468, "stadium": "Providence Park", "city": "Portland", "capacity": 25218, "founded": 2009, "coach": "Phil Neville"},
    {"fc27": "St. Louis CITY SC", "name": "St. Louis City SC", "short": "STL", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#E31937", "secondary": "#0C2340", "budgetM": 28, "tm": 86435, "stadium": "CITYPARK", "city": "St. Louis", "capacity": 22500, "founded": 2019, "coach": "John Hackworth"},
    {"fc27": "Austin FC", "name": "Austin FC", "short": "ATX", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#00B140", "secondary": "#000000", "budgetM": 28, "tm": 72297, "stadium": "Q2 Stadium", "city": "Austin", "capacity": 20738, "founded": 2018, "coach": "Nico Estévez"},
    {"fc27": "Charlotte FC", "name": "Charlotte FC", "short": "CLT", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#1A85C8", "secondary": "#000000", "budgetM": 28, "tm": 78534, "stadium": "Bank of America Stadium", "city": "Charlotte", "capacity": 38000, "founded": 2019, "coach": "Dean Smith"},
    {"fc27": "Chicago Fire FC", "name": "Chicago Fire", "short": "CHI", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#7C2529", "secondary": "#41748D", "budgetM": 28, "tm": 432, "stadium": "Soldier Field", "city": "Chicago", "capacity": 24955, "founded": 1997, "coach": "Gregg Berhalter"},
    {"fc27": "Toronto FC", "name": "Toronto FC", "short": "TOR", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#B81137", "secondary": "#455560", "budgetM": 32, "tm": 11141, "stadium": "BMO Field", "city": "Toronto", "capacity": 28351, "founded": 2005, "coach": "John Herdman"},
    {"fc27": "CF Montréal", "name": "CF Montréal", "short": "MTL", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#002B49", "secondary": "#7C2529", "budgetM": 22, "tm": 4070, "stadium": "Stade Saputo", "city": "Montréal", "capacity": 19619, "founded": 2010, "coach": "Laurent Courtois"},
    {"fc27": "Real Salt Lake", "name": "Real Salt Lake", "short": "RSL", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#B30838", "secondary": "#001E62", "budgetM": 26, "tm": 6643, "stadium": "America First Field", "city": "Sandy", "capacity": 20213, "founded": 2004, "coach": "Pablo Mastroeni"},
    {"fc27": "Minnesota United", "name": "Minnesota United", "short": "MIN", "country": "Estados Unidos", "league": "Major League Soccer", "division": "Major League Soccer", "tier": 1, "primary": "#DFE5E8", "secondary": "#231F20", "budgetM": 24, "tm": 50742, "stadium": "Allianz Field", "city": "Saint Paul", "capacity": 19400, "founded": 2015, "coach": "Eric Ramsay"},
]

# Argentina (20 clubs)
ARGENTINA_CLUBS: list[dict[str, Any]] = [
    {"fc27": "River Plate", "name": "River Plate", "short": "RIV", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#FFFFFF", "secondary": "#EE1C25", "budgetM": 40, "tm": 209, "stadium": "Mâs Monumental", "city": "Buenos Aires", "capacity": 84567, "founded": 1901, "coach": "Marcelo Gallardo"},
    {"fc27": "Boca Juniors", "name": "Boca Juniors", "short": "BOC", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#002B49", "secondary": "#FEE100", "budgetM": 38, "tm": 189, "stadium": "La Bombonera", "city": "Buenos Aires", "capacity": 54000, "founded": 1905, "coach": "Fernando Gago"},
    {"fc27": "Racing Club", "name": "Racing Club", "short": "RAC", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#87CEEB", "secondary": "#FFFFFF", "budgetM": 24, "tm": 1444, "stadium": "Presidente Perón", "city": "Avellaneda", "capacity": 51389, "founded": 1903, "coach": "Gustavo Costas"},
    {"fc27": "Independiente", "name": "Independiente", "short": "IND", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 22, "tm": 1234, "stadium": "Libertadores de América", "city": "Avellaneda", "capacity": 48069, "founded": 1905, "coach": "Julio Vaccari"},
    {"fc27": "San Lorenzo", "name": "San Lorenzo", "short": "SLO", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#002B49", "secondary": "#C8102E", "budgetM": 20, "tm": 1775, "stadium": "Pedro Bidegain", "city": "Buenos Aires", "capacity": 47964, "founded": 1908, "coach": "Miguel Ángel Russo"},
    {"fc27": "Vélez Sarsfield", "name": "Vélez Sarsfield", "short": "VEL", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#002B49", "secondary": "#FFFFFF", "budgetM": 22, "tm": 1029, "stadium": "José Amalfitani", "city": "Buenos Aires", "capacity": 49747, "founded": 1910, "coach": "Gustavo Quinteros"},
    {"fc27": "Estudiantes", "name": "Estudiantes de La Plata", "short": "EST", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 20, "tm": 288, "stadium": "Jorge Luis Hirschi", "city": "La Plata", "capacity": 32530, "founded": 1905, "coach": "Eduardo Domínguez"},
    {"fc27": "Lanús", "name": "Lanús", "short": "LAN", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#800020", "secondary": "#FFFFFF", "budgetM": 18, "tm": 333, "stadium": "Ciudad de Lanús", "city": "Lanús", "capacity": 47027, "founded": 1915, "coach": "Ricardo Zielinski"},
    {"fc27": "Talleres", "name": "Talleres de Córdoba", "short": "TAL", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#002B49", "secondary": "#FFFFFF", "budgetM": 22, "tm": 3938, "stadium": "Mario Alberto Kempes", "city": "Córdoba", "capacity": 57000, "founded": 1913, "coach": "Alexander Medina"},
    {"fc27": "Rosario Central", "name": "Rosario Central", "short": "ROS", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#002B49", "secondary": "#FFD100", "budgetM": 18, "tm": 1418, "stadium": "Gigante de Arroyito", "city": "Rosario", "capacity": 46955, "founded": 1889, "coach": "Matías Lequi"},
    {"fc27": "Newell's", "name": "Newell's Old Boys", "short": "NOB", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#000000", "secondary": "#E30613", "budgetM": 17, "tm": 1286, "stadium": "Marcelo Bielsa", "city": "Rosario", "capacity": 42000, "founded": 1903, "coach": "Ricardo Lunari"},
    {"fc27": "Huracán", "name": "Huracán", "short": "HUR", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#FFFFFF", "secondary": "#E30613", "budgetM": 16, "tm": 2063, "stadium": "Tomás Adolfo Ducó", "city": "Buenos Aires", "capacity": 48314, "founded": 1908, "coach": "Frank Kudelka"},
    {"fc27": "Argentinos Jrs.", "name": "Argentinos Juniors", "short": "ARG", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 16, "tm": 1030, "stadium": "Diego Armando Maradona", "city": "Buenos Aires", "capacity": 26000, "founded": 1904, "coach": "Cristian Zermatten"},
    {"fc27": "Belgrano", "name": "Belgrano", "short": "BEL", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#87CEEB", "secondary": "#000000", "budgetM": 15, "tm": 3937, "stadium": "Julio César Villagra", "city": "Córdoba", "capacity": 34000, "founded": 1905, "coach": "Juan Cruz Real"},
    {"fc27": "Defensa", "name": "Defensa y Justicia", "short": "DYJ", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#008000", "secondary": "#FFFF00", "budgetM": 15, "tm": 3943, "stadium": "Norberto Tomaghello", "city": "Florencio Varela", "capacity": 20000, "founded": 1935, "coach": "Pablo De Muner"},
    {"fc27": "Gimnasia La Plata", "name": "Gimnasia La Plata", "short": "GLP", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#002B49", "secondary": "#FFFFFF", "budgetM": 14, "tm": 1106, "stadium": "Juan Carmelo Zerillo", "city": "La Plata", "capacity": 31000, "founded": 1887, "coach": "Marcelo Méndez"},
    {"fc27": "Banfield", "name": "Banfield", "short": "BAN", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#006437", "secondary": "#FFFFFF", "budgetM": 13, "tm": 830, "stadium": "Florencio Sola", "city": "Banfield", "capacity": 34901, "founded": 1896, "coach": "Gustavo Munúa"},
    {"fc27": "Tigre", "name": "Tigre", "short": "TIG", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#002B49", "secondary": "#E30613", "budgetM": 14, "tm": 11831, "stadium": "José Dellagiovanna", "city": "Victoria", "capacity": 26282, "founded": 1902, "coach": "Sebastián Domínguez"},
    {"fc27": "Atlético Tucumán", "name": "Atlético Tucumán", "short": "ATU", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#87CEEB", "secondary": "#FFFFFF", "budgetM": 13, "tm": 14554, "stadium": "Monumental José Fierro", "city": "San Miguel de Tucumán", "capacity": 35200, "founded": 1902, "coach": "Facundo Sava"},
    {"fc27": "Unión", "name": "Unión de Santa Fe", "short": "UNI", "country": "Argentina", "league": "Liga Profesional de Fútbol", "division": "Liga Profesional de Fútbol", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 13, "tm": 1159, "stadium": "15 de Abril", "city": "Santa Fe", "capacity": 30000, "founded": 1907, "coach": "Cristian González"},
]

# Turkey (18 clubs)
TURKEY_CLUBS: list[dict[str, Any]] = [
    {"fc27": "Galatasaray", "name": "Galatasaray", "short": "GAL", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#A90432", "secondary": "#FDB912", "budgetM": 55, "tm": 141, "stadium": "Ali Sami Yen RAMS Park", "city": "Istambul", "capacity": 53978, "founded": 1905, "coach": "Okan Buruk"},
    {"fc27": "Fenerbahçe", "name": "Fenerbahçe", "short": "FEN", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#002366", "secondary": "#FFFF00", "budgetM": 52, "tm": 36, "stadium": "Şükrü Saracoğlu Stadyumu", "city": "Istambul", "capacity": 47430, "founded": 1907, "coach": "José Mourinho"},
    {"fc27": "Beşiktaş", "name": "Beşiktaş", "short": "BES", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 38, "tm": 114, "stadium": "Tüpraş Stadyumu", "city": "Istambul", "capacity": 42684, "founded": 1903, "coach": "Giovanni van Bronckhorst"},
    {"fc27": "Trabzonspor", "name": "Trabzonspor", "short": "TRA", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#800020", "secondary": "#87CEEB", "budgetM": 28, "tm": 449, "stadium": "Papara Park", "city": "Trabzon", "capacity": 40782, "founded": 1967, "coach": "Şenol Güneş"},
    {"fc27": "Başakşehir", "name": "Başakşehir", "short": "BAS", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#F26522", "secondary": "#122442", "budgetM": 25, "tm": 6890, "stadium": "Başakşehir Fatih Terim", "city": "Istambul", "capacity": 17156, "founded": 1990, "coach": "Çağdaş Atan"},
    {"fc27": "Samsunspor", "name": "Samsunspor", "short": "SAM", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 18, "tm": 152, "stadium": "Samsun 19 Mayıs", "city": "Samsun", "capacity": 33919, "founded": 1965, "coach": "Thomas Reis"},
    {"fc27": "Göztepe", "name": "Göztepe", "short": "GOZ", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#FEE100", "secondary": "#C8102E", "budgetM": 18, "tm": 1467, "stadium": "Gürsel Aksel Stadyumu", "city": "Esmirna", "capacity": 20035, "founded": 1925, "coach": "Stanimir Stoilov"},
    {"fc27": "Eyüpspor", "name": "Eyüpspor", "short": "EYU", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#800080", "secondary": "#FFD700", "budgetM": 16, "tm": 7481, "stadium": "Recep Tayyip Erdoğan", "city": "Istambul", "capacity": 14234, "founded": 1919, "coach": "Arda Turan"},
    {"fc27": "Kasımpaşa", "name": "Kasımpaşa", "short": "KAS", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#00205B", "secondary": "#FFFFFF", "budgetM": 15, "tm": 10484, "stadium": "Recep Tayyip Erdoğan", "city": "Istambul", "capacity": 14234, "founded": 1921, "coach": "Sami Uğurlu"},
    {"fc27": "Alanyaspor", "name": "Alanyaspor", "short": "ALA", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#FF7900", "secondary": "#008000", "budgetM": 15, "tm": 11282, "stadium": "Alanya Oba Stadyumu", "city": "Alanya", "capacity": 10128, "founded": 1948, "coach": "Fatih Tekke"},
    {"fc27": "Konyaspor", "name": "Konyaspor", "short": "KON", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#008000", "secondary": "#FFFFFF", "budgetM": 14, "tm": 2293, "stadium": "Medaş Konya Büyükşehir", "city": "Cônia", "capacity": 42000, "founded": 1922, "coach": "Recep Uçar"},
    {"fc27": "Rizespor", "name": "Çaykur Rizespor", "short": "RIZ", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#008000", "secondary": "#0000FF", "budgetM": 14, "tm": 126, "stadium": "Çaykur Didi Stadyumu", "city": "Rize", "capacity": 15558, "founded": 1953, "coach": "İlhan Palut"},
    {"fc27": "Gaziantep", "name": "Gaziantep FK", "short": "GFK", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#C8102E", "secondary": "#000000", "budgetM": 14, "tm": 2832, "stadium": "Gaziantep Stadyumu", "city": "Gaziantep", "capacity": 35574, "founded": 1988, "coach": "Selçuk İnan"},
    {"fc27": "Kocaelispor", "name": "Kocaelispor", "short": "KOC", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#008000", "secondary": "#000000", "budgetM": 12, "tm": 120, "stadium": "Kocaeli Stadyumu", "city": "İzmit", "capacity": 34829, "founded": 1966, "coach": "Ertuğrul Sağlam"},
    {"fc27": "Amed", "name": "Amedspor", "short": "AMD", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#006400", "secondary": "#E30613", "budgetM": 11, "tm": 2831, "stadium": "Diyarbakır Stadyumu", "city": "Diyarbakır", "capacity": 33000, "founded": 1972, "coach": "Servet Çetin"},
    {"fc27": "Gençlerbirliği", "name": "Gençlerbirliği", "short": "GEN", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#E30613", "secondary": "#000000", "budgetM": 11, "tm": 820, "stadium": "Eryaman Stadyumu", "city": "Ancara", "capacity": 20560, "founded": 1923, "coach": "Recep Karatepe"},
    {"fc27": "Erzurum FK", "name": "Erzurumspor FK", "short": "ERZ", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#002B49", "secondary": "#FFFFFF", "budgetM": 10, "tm": 2292, "stadium": "Kâzım Karabekir", "city": "Erzurum", "capacity": 21374, "founded": 2005, "coach": "Hakan Kutlu"},
    {"fc27": "Çorum FK", "name": "Çorum FK", "short": "COR", "country": "Turquia", "league": "Trendyol Süper Lig", "division": "Trendyol Süper Lig", "tier": 1, "primary": "#C8102E", "secondary": "#000000", "budgetM": 10, "tm": 2830, "stadium": "Çorum Şehir Stadyumu", "city": "Çorum", "capacity": 15000, "founded": 1997, "coach": "Serkan Özbalta"},
]

# Mexico (18 clubs)
MEXICO_CLUBS: list[dict[str, Any]] = [
    {"fc27": "Club América", "name": "Club América", "short": "AME", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#FFFF99", "secondary": "#002B49", "budgetM": 45, "tm": 3631, "stadium": "Estadio Azteca", "city": "Cidade do México", "capacity": 87523, "founded": 1916, "coach": "André Jardine"},
    {"fc27": "Club Guadalajara", "name": "Chivas Guadalajara", "short": "GDL", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#E30613", "secondary": "#002B49", "budgetM": 38, "tm": 6711, "stadium": "Estadio Akron", "city": "Zapopan", "capacity": 49580, "founded": 1906, "coach": "Arturo Ortega"},
    {"fc27": "CF Cruz Azul", "name": "Cruz Azul", "short": "CAZ", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#0047AB", "secondary": "#FFFFFF", "budgetM": 36, "tm": 3711, "stadium": "Estadio Ciudad de los Deportes", "city": "Cidade do México", "capacity": 36682, "founded": 1927, "coach": "Martín Anselmi"},
    {"fc27": "Monterrey", "name": "CF Monterrey", "short": "MTY", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#002B49", "secondary": "#FFFFFF", "budgetM": 48, "tm": 2407, "stadium": "Estadio BBVA", "city": "Guadalupe", "capacity": 53500, "founded": 1945, "coach": "Martín Demichelis"},
    {"fc27": "Club Tigres", "name": "Tigres UANL", "short": "TIG", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#FDB913", "secondary": "#0047AB", "budgetM": 44, "tm": 7055, "stadium": "Estadio Universitario", "city": "San Nicolás de los Garza", "capacity": 41886, "founded": 1960, "coach": "Veljko Paunović"},
    {"fc27": "Toluca FC", "name": "Toluca FC", "short": "TOL", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 32, "tm": 1804, "stadium": "Estadio Nemesio Díez", "city": "Toluca", "capacity": 31000, "founded": 1917, "coach": "Renato Paiva"},
    {"fc27": "Pumas", "name": "Pumas UNAM", "short": "PUM", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#002B49", "secondary": "#CFB53B", "budgetM": 26, "tm": 7633, "stadium": "Estadio Olímpico Universitario", "city": "Cidade do México", "capacity": 72000, "founded": 1954, "coach": "Gustavo Lema"},
    {"fc27": "Club Pachuca", "name": "CF Pachuca", "short": "PAC", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#002B49", "secondary": "#FFFFFF", "budgetM": 25, "tm": 4035, "stadium": "Estadio Hidalgo", "city": "Pachuca", "capacity": 30000, "founded": 1892, "coach": "Guillermo Almada"},
    {"fc27": "Santos Laguna", "name": "Santos Laguna", "short": "SAN", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#008000", "secondary": "#FFFFFF", "budgetM": 22, "tm": 1403, "stadium": "Estadio Corona", "city": "Torreón", "capacity": 29237, "founded": 1983, "coach": "Ignacio Ambriz"},
    {"fc27": "Club León", "name": "Club León", "short": "LEO", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#006437", "secondary": "#FFD700", "budgetM": 22, "tm": 4941, "stadium": "Estadio León", "city": "León", "capacity": 31297, "founded": 1944, "coach": "Eduardo Berizzo"},
    {"fc27": "Club Tijuana", "name": "Club Tijuana", "short": "TIJ", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#E30613", "secondary": "#000000", "budgetM": 20, "tm": 13353, "stadium": "Estadio Caliente", "city": "Tijuana", "capacity": 29333, "founded": 2007, "coach": "Juan Carlos Osorio"},
    {"fc27": "Club Necaxa", "name": "Club Necaxa", "short": "NEC", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 18, "tm": 1146, "stadium": "Estadio Victoria", "city": "Aguascalientes", "capacity": 23851, "founded": 1923, "coach": "Eduardo Fentanes"},
    {"fc27": "Club Puebla", "name": "Club Puebla", "short": "PUE", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#0047AB", "secondary": "#FFFFFF", "budgetM": 16, "tm": 5662, "stadium": "Estadio Cuauhtémoc", "city": "Puebla", "capacity": 47704, "founded": 1944, "coach": "José Manuel de la Torre"},
    {"fc27": "Querétaro FC", "name": "Querétaro FC", "short": "QUE", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#002B49", "secondary": "#000000", "budgetM": 15, "tm": 4961, "stadium": "Estadio Corregidora", "city": "Querétaro", "capacity": 34107, "founded": 1950, "coach": "Mauro Gerk"},
    {"fc27": "Atlas FC", "name": "Atlas FC", "short": "ATL", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#E30613", "secondary": "#000000", "budgetM": 18, "tm": 8590, "stadium": "Estadio Jalisco", "city": "Guadalajara", "capacity": 55110, "founded": 1916, "coach": "Beñat San José"},
    {"fc27": "FC Juárez", "name": "FC Juárez", "short": "JUA", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#00FF00", "secondary": "#E30613", "budgetM": 15, "tm": 49283, "stadium": "Estadio Olímpico Benito Juárez", "city": "Ciudad Juárez", "capacity": 19703, "founded": 2015, "coach": "Maurício Barbieri"},
    {"fc27": "Atlético de SL", "name": "Atlético de San Luis", "short": "ASL", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#E30613", "secondary": "#002B49", "budgetM": 16, "tm": 40188, "stadium": "Estadio Alfonso Lastras", "city": "San Luis Potosí", "capacity": 27029, "founded": 2013, "coach": "Domènec Torrent"},
    {"fc27": "Atlante FC", "name": "Atlante FC", "short": "ATF", "country": "México", "league": "Liga BBVA MX", "division": "Liga BBVA MX", "tier": 1, "primary": "#002B49", "secondary": "#800020", "budgetM": 12, "tm": 331, "stadium": "Estadio Ciudad de los Deportes", "city": "Cidade do México", "capacity": 36682, "founded": 1916, "coach": "Daniel Alcántar"},
]

# Scotland (12 clubs)
SCOTLAND_CLUBS: list[dict[str, Any]] = [
    {"fc27": "Celtic", "name": "Celtic FC", "short": "CEL", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#008000", "secondary": "#FFFFFF", "budgetM": 35, "tm": 371, "stadium": "Celtic Park", "city": "Glasgow", "capacity": 60411, "founded": 1887, "coach": "Brendan Rodgers"},
    {"fc27": "Rangers", "name": "Rangers FC", "short": "RAN", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#0047AB", "secondary": "#FFFFFF", "budgetM": 30, "tm": 124, "stadium": "Ibrox Stadium", "city": "Glasgow", "capacity": 50987, "founded": 1872, "coach": "Philippe Clement"},
    {"fc27": "Aberdeen", "name": "Aberdeen FC", "short": "ABE", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 14, "tm": 370, "stadium": "Pittodrie Stadium", "city": "Aberdeen", "capacity": 20866, "founded": 1903, "coach": "Jimmy Thelin"},
    {"fc27": "Hearts", "name": "Heart of Midlothian", "short": "HEA", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#800020", "secondary": "#FFFFFF", "budgetM": 14, "tm": 443, "stadium": "Tynecastle Park", "city": "Edimburgo", "capacity": 19852, "founded": 1874, "coach": "Neil Critchley"},
    {"fc27": "Hibernian", "name": "Hibernian FC", "short": "HIB", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#006437", "secondary": "#FFFFFF", "budgetM": 12, "tm": 903, "stadium": "Easter Road", "city": "Edimburgo", "capacity": 20421, "founded": 1875, "coach": "David Gray"},
    {"fc27": "Dundee United", "name": "Dundee United", "short": "DUT", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#FF7900", "secondary": "#000000", "budgetM": 10, "tm": 513, "stadium": "Tannadice Park", "city": "Dundee", "capacity": 14223, "founded": 1909, "coach": "Jim Goodwin"},
    {"fc27": "Dundee FC", "name": "Dundee FC", "short": "DFC", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#002B49", "secondary": "#FFFFFF", "budgetM": 9, "tm": 511, "stadium": "Dens Park", "city": "Dundee", "capacity": 11775, "founded": 1893, "coach": "Tony Docherty"},
    {"fc27": "Kilmarnock", "name": "Kilmarnock FC", "short": "KIL", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#0047AB", "secondary": "#FFFFFF", "budgetM": 9, "tm": 2553, "stadium": "Rugby Park", "city": "Kilmarnock", "capacity": 17889, "founded": 1869, "coach": "Derek McInnes"},
    {"fc27": "Motherwell", "name": "Motherwell FC", "short": "MOT", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#800020", "secondary": "#FDB913", "budgetM": 8, "tm": 987, "stadium": "Fir Park", "city": "Motherwell", "capacity": 13677, "founded": 1886, "coach": "Stuart Kettlewell"},
    {"fc27": "St. Mirren", "name": "St. Mirren FC", "short": "STM", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#000000", "secondary": "#FFFFFF", "budgetM": 8, "tm": 1238, "stadium": "The SMISA Stadium", "city": "Paisley", "capacity": 7937, "founded": 1877, "coach": "Stephen Robinson"},
    {"fc27": "St. Johnstone", "name": "St. Johnstone FC", "short": "STJ", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#0047AB", "secondary": "#FFFFFF", "budgetM": 7, "tm": 2578, "stadium": "McDiarmid Park", "city": "Perth", "capacity": 10696, "founded": 1884, "coach": "Simo Valakari"},
    {"fc27": "Falkirk", "name": "Falkirk FC", "short": "FAL", "country": "Escócia", "league": "Scottish Premiership", "division": "Scottish Premiership", "tier": 1, "primary": "#002B49", "secondary": "#FFFFFF", "budgetM": 7, "tm": 1218, "stadium": "Falkirk Stadium", "city": "Falkirk", "capacity": 8200, "founded": 1876, "coach": "John McGlynn"},
]

# PL Clubs visuals
PL_VISUALS: dict[str, dict[str, Any]] = {
    "Arsenal": {"short": "ARS", "primary": "#EF0107", "secondary": "#FFFFFF", "budgetM": 135, "tm": 11},
    "Aston Villa": {"short": "AVL", "primary": "#670E36", "secondary": "#95BFE5", "budgetM": 80, "tm": 405},
    "AFC Bournemouth": {"short": "BOU", "primary": "#DA291C", "secondary": "#000000", "budgetM": 55, "tm": 989},
    "Brentford": {"short": "BRE", "primary": "#E30613", "secondary": "#FFFFFF", "budgetM": 48, "tm": 1148},
    "Brighton & Hove Albion": {"short": "BHA", "primary": "#0057B8", "secondary": "#FFCD00", "budgetM": 70, "tm": 1237},
    "Chelsea": {"short": "CHE", "primary": "#034694", "secondary": "#FFFFFF", "budgetM": 140, "tm": 631},
    "Coventry City": {"short": "COV", "primary": "#58B9E8", "secondary": "#0D1B2A", "budgetM": 32, "tm": 990},
    "Crystal Palace": {"short": "CRY", "primary": "#1B458F", "secondary": "#C4122E", "budgetM": 52, "tm": 873},
    "Everton": {"short": "EVE", "primary": "#003399", "secondary": "#FFFFFF", "budgetM": 46, "tm": 29},
    "Fulham": {"short": "FUL", "primary": "#111111", "secondary": "#CC0000", "budgetM": 50, "tm": 931},
    "Hull City": {"short": "HUL", "primary": "#F59E0B", "secondary": "#111111", "budgetM": 28, "tm": 3008},
    "Ipswich Town": {"short": "IPS", "primary": "#3A64A3", "secondary": "#FFFFFF", "budgetM": 35, "tm": 677},
    "Leeds United": {"short": "LEE", "primary": "#FFCD00", "secondary": "#1D428A", "budgetM": 44, "tm": 399},
    "Liverpool": {"short": "LIV", "primary": "#C8102E", "secondary": "#00B2A9", "budgetM": 145, "tm": 31},
    "Manchester City": {"short": "MCI", "primary": "#6CABDD", "secondary": "#1C2C5B", "budgetM": 160, "tm": 281},
    "Manchester United": {"short": "MUN", "primary": "#DA291C", "secondary": "#FBE122", "budgetM": 130, "tm": 985},
    "Newcastle United": {"short": "NEW", "primary": "#241F20", "secondary": "#FFFFFF", "budgetM": 105, "tm": 762},
    "Nottingham Forest": {"short": "NFO", "primary": "#DD0000", "secondary": "#FFFFFF", "budgetM": 54, "tm": 703},
    "Sunderland": {"short": "SUN", "primary": "#EB172B", "secondary": "#FFFFFF", "budgetM": 34, "tm": 289},
    "Tottenham Hotspur": {"short": "TOT", "primary": "#132257", "secondary": "#FFFFFF", "budgetM": 115, "tm": 148},
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
            if prev is None or (season, mv) > (prev["last_season"], prev["market_value_eur"]):
                lookup[key] = {
                    "last_season": season,
                    "market_value_eur": mv,
                    "image_url": (row.get("image_url") or "").strip(),
                    "contract_expiration": (row.get("contract_expiration_date") or "")[:10],
                    "tm_club": (row.get("current_club_name") or "").strip(),
                    "sub_position": row.get("sub_position") or "",
                    "date_of_birth": (row.get("date_of_birth") or "")[:10],
                }
    print(f"[etl] Indexed {len(lookup)} unique Transfermarkt names")
    return lookup

def tm_subpos_to_pos(subpos: str, main_pos: str) -> tuple[str, str]:
    sub = subpos.strip().lower()
    if "goalkeeper" in sub:
        return "GK", "GK"
    if "centre-back" in sub:
        return "CB", "DEF"
    if "left-back" in sub:
        return "LB", "DEF"
    if "right-back" in sub:
        return "RB", "DEF"
    if "defensive midfield" in sub:
        return "CDM", "MID"
    if "central midfield" in sub:
        return "CM", "MID"
    if "attacking midfield" in sub:
        return "CAM", "MID"
    if "left winger" in sub:
        return "LW", "ATT"
    if "right winger" in sub:
        return "RW", "ATT"
    if "centre-forward" in sub or "second striker" in sub:
        return "ST", "ATT"
    pos = main_pos.strip().lower()
    if "def" in pos:
        return "CB", "DEF"
    if "mid" in pos:
        return "CM", "MID"
    if "att" in pos:
        return "ST", "ATT"
    return "CM", "MID"

def tm_mv_to_overall(mv: int, age: int) -> int:
    if mv >= 30_000_000:
        base = 82 + min(4, (mv - 30_000_000) // 10_000_000)
    elif mv >= 15_000_000:
        base = 78 + min(4, (mv - 15_000_000) // 4_000_000)
    elif mv >= 8_000_000:
        base = 75 + min(3, (mv - 8_000_000) // 2_500_000)
    elif mv >= 3_000_000:
        base = 72 + min(3, (mv - 3_000_000) // 2_000_000)
    elif mv >= 1_000_000:
        base = 68 + min(4, (mv - 1_000_000) // 500_000)
    else:
        base = 62 + min(6, mv // 150_000)
    if age >= 31 and mv >= 2_000_000:
        base = max(base, 76)
    return max(62, min(86, base))

def generate_player_attributes(overall: int, role_cat: str, is_gk: bool) -> tuple[dict[str, int], dict[str, int]]:
    pace = max(45, overall - (18 if is_gk else 2))
    shooting = max(35, overall - (32 if is_gk else 16 if role_cat == "DEF" else 2))
    passing = max(45, overall - (10 if is_gk else 3))
    dribbling = max(40, overall - (18 if is_gk else 4))
    defending = max(35, overall if (is_gk or role_cat == "DEF") else overall - 22 if role_cat == "ATT" else overall - 8)
    physicality = max(50, overall - 2)
    reflexes = overall if is_gk else max(50, overall - 4)

    face = {
        "pace": pace,
        "shooting": shooting,
        "passing": passing,
        "dribbling": dribbling,
        "defending": defending,
        "physicality": physicality,
        "reflexes": reflexes,
    }
    stats = {
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
    }
    return face, stats

def main() -> None:
    print("[etl] Starting FM 2026/27 Unified Database Pipeline...")
    fc27_zip = zipfile.ZipFile(io.BytesIO(download_with_cache(KAGGLE_URLS["fc27"], "fc27.zip")))
    pl_zip = zipfile.ZipFile(io.BytesIO(download_with_cache(KAGGLE_URLS["pl2627"], "pl2627.zip")))
    wc_zip = zipfile.ZipFile(io.BytesIO(download_with_cache(KAGGLE_URLS["wc26"], "wc26.zip")))
    tm_bytes = download_with_cache(TM_PLAYERS_URL, "tm_players.csv.gz")

    tm_lookup = load_transfermarkt_lookup(tm_bytes)

    # 1. Referees (28 FIFA Referees from WC 2026)
    referees: list[dict[str, Any]] = []
    with wc_zip.open("referees.csv") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            referees.append({
                "id": to_int(row["referee_id"]),
                "name": row["name"].strip(),
                "country": row["country"].strip(),
                "avgCardsPerGame": float(row["avg_cards_per_game"] or 4.0),
            })

    # 2. Build Clubs Catalog across all 13 leagues
    clubs: list[dict[str, Any]] = []
    club_id_by_name: dict[str, int] = {}
    fc27_club_to_id: dict[tuple[str, str], int] = {}
    brazil_club_to_id: dict[int, int] = {}

    # 2a. Premier League (20 clubs)
    managers_by_team: dict[str, dict[str, str]] = {}
    with pl_zip.open("managers_and_club_info.csv") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            managers_by_team[row["team"].strip()] = row

    with pl_zip.open("teams_and_stadiums.csv") as f:
        for idx, row in enumerate(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")), start=1):
            name = row["team"].strip()
            mgr = managers_by_team.get(name, {})
            vis = PL_VISUALS[name]
            cid = len(clubs) + 1
            club_id_by_name[name] = cid
            budget_eur = vis["budgetM"] * 1_000_000
            clubs.append({
                "id": cid,
                "name": name,
                "shortName": vis["short"],
                "country": "Inglaterra",
                "league": "Premier League",
                "division": "Premier League",
                "tier": 1,
                "primaryColor": vis["primary"],
                "secondaryColor": vis["secondary"],
                "badgeUrl": f"https://tmssl.akamaized.net//images/wappen/head/{vis['tm']}.png",
                "stadiumImageUrl": "",
                "stadium": row["stadium"].strip(),
                "city": row["city"].strip(),
                "capacity": to_int(row["capacity_2026_27"], 30000),
                "capacityNote": row["capacity_note"].strip(),
                "foundedYear": to_int(row["founded_year"], 1900),
                "status": row["status_for_2026_27"].strip(),
                "previousSeasonContext": row["previous_season_context"].strip(),
                "manager": (mgr.get("manager") or "Caretaker Manager").strip(),
                "managerNationality": (mgr.get("manager_nationality") or "England").strip(),
                "managerAppointed": (mgr.get("appointed") or "2026").strip(),
                "previousClub": (mgr.get("previous_club_as_manager") or "").strip(),
                "notableHonours": (mgr.get("notable_honours_as_manager") or "").strip(),
                "transferBudgetEur": budget_eur,
                "wageBudgetWeeklyEur": int(round(budget_eur * 0.022 / 1000) * 1000),
                "avgOverall": 78,
            })
            # Map FC27 names for PL
            for fc_k, pl_v in FC27_TO_PL_CLUB.items():
                if pl_v == name:
                    fc27_club_to_id[("Premier League", fc_k)] = cid

    # Helper to append international / EFL club sets
    def register_clubs(club_specs: list[dict[str, Any]]) -> None:
        for spec in club_specs:
            cid = len(clubs) + 1
            cname = spec["name"]
            club_id_by_name[cname] = cid
            budget_eur = spec["budgetM"] * 1_000_000
            tm_id = spec["tm"]
            clubs.append({
                "id": cid,
                "name": cname,
                "shortName": spec["short"],
                "country": spec["country"],
                "league": spec["league"],
                "division": spec["division"],
                "tier": spec["tier"],
                "primaryColor": spec["primary"],
                "secondaryColor": spec["secondary"],
                "badgeUrl": f"https://tmssl.akamaized.net//images/wappen/head/{tm_id}.png",
                "stadiumImageUrl": spec.get("img", ""),
                "stadium": spec["stadium"],
                "city": spec["city"],
                "capacity": spec["capacity"],
                "capacityNote": "",
                "foundedYear": spec["founded"],
                "status": spec["league"],
                "previousSeasonContext": f"Disputando a temporada oficial 2026/27.",
                "manager": spec.get("coach") or "Técnico Principal",
                "managerNationality": spec["country"],
                "managerAppointed": "2026",
                "previousClub": "",
                "notableHonours": "",
                "transferBudgetEur": budget_eur,
                "wageBudgetWeeklyEur": max(40_000, int(round(budget_eur * 0.022 / 1000) * 1000)),
                "avgOverall": 74,
            })
            if "fc27" in spec:
                fc27_club_to_id[(spec["league"], spec["fc27"])] = cid
            if "tm_name" in spec:
                brazil_club_to_id[tm_id] = cid

    register_clubs(EFL_CLUBS)
    register_clubs(SPAIN_CLUBS)
    register_clubs(ITALY_CLUBS)
    register_clubs(GERMANY_CLUBS)
    register_clubs(FRANCE_CLUBS)
    register_clubs(SAUDI_CLUBS)
    register_clubs(BRAZIL_CLUBS)
    register_clubs(PORTUGAL_CLUBS)
    register_clubs(NETHERLANDS_CLUBS)
    register_clubs(MLS_CLUBS)
    register_clubs(ARGENTINA_CLUBS)
    register_clubs(TURKEY_CLUBS)
    register_clubs(MEXICO_CLUBS)
    register_clubs(SCOTLAND_CLUBS)

    print(f"[etl] Total clubs registered: {len(clubs)}")

    # 3. Synchronize Players
    players: list[dict[str, Any]] = []
    seen_person_keys: set[tuple[str, str]] = set()
    next_player_id = 1

    # 3a. Ingest FC27 players for European, English, Saudi, MLS clubs (Men's competitions only)
    EXCLUDED_LEAGUE_KEYWORDS = (
        "Women",
        "Fem",
        "Frauen",
        "Vrouwen",
        "Damen",
        "Kvenna",
        "Kvinner",
        "Žen",
        "Liga F",
        "Arkema",
        "Icon",
    )
    with fc27_zip.open("fc27_players_database.csv") as f:
        reader = list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))
        # Sort: Base official cards (rarity == 'Rare' and eaId < 50_000_000) first, then higher overall
        reader.sort(
            key=lambda r: (
                0 if (r.get("rarity") or "").strip() == "Rare" and to_int(r.get("eaId"), 0) < 50_000_000 else 1,
                -to_int(r.get("overall"), 0),
            )
        )
        for row in reader:
            league = (row.get("league") or "").strip()
            if any(kw in league for kw in EXCLUDED_LEAGUE_KEYWORDS):
                continue

            raw_club = (row.get("club") or "").strip()
            overall = to_int(row.get("overall"), 70)

            # Look up club
            club_id = fc27_club_to_id.get((league, raw_club))
            if club_id is None:
                # Also try matching without league constraint if club name matches (only among men's leagues)
                for (l_name, c_name), cid in fc27_club_to_id.items():
                    if c_name == raw_club:
                        club_id = cid
                        break
            if club_id is None:
                continue

            club_obj = clubs[club_id - 1]
            player_name = (row.get("player_name") or "").strip()
            full_name = (row.get("full_name") or player_name).strip()
            nationality = (row.get("nation") or club_obj["country"]).strip()

            person_key = (normalize_name(player_name), normalize_name(nationality))
            if person_key in seen_person_keys:
                continue
            seen_person_keys.add(person_key)

            fc_iq_str = (row.get("fc_iq_roles") or "").strip()
            raw_positions = [p.strip() for p in (row.get("positions") or "CM").split(",") if p.strip()]
            if fc_iq_str.startswith("GK "):
                raw_positions = ["GK"]
            primary_pos = raw_positions[0] if raw_positions else "CM"
            role_cat = classify_role(primary_pos)
            is_gk = primary_pos == "GK"
            age = to_int(row.get("age"), 25)

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

                # Detect Kaggle CSV scraper bug where overall was overwritten by face_pace (e.g., Zak Lovelace OVR 87 with 59 DRI / 57 SHO)
                other_face_max = max(shooting, passing, dribbling, defending, physicality)
                if overall == pace and (overall - other_face_max) >= 12:
                    role_scores = [float(x) for x in re.findall(r":\s*([0-9.]+)", fc_iq_str)]
                    if role_scores:
                        overall = max(55, min(78, int(round(max(role_scores)))))
                    else:
                        overall = max(55, min(78, int(round((pace * 0.2 + other_face_max * 0.8)))))

            tm = tm_lookup.get(normalize_name(player_name)) or tm_lookup.get(normalize_name(full_name))
            tm_mv = tm["market_value_eur"] if tm and tm["market_value_eur"] > 0 else 0

            # If card is a non-Rare FUT Promo card (e.g. Future Stars / TOTW with eaId >= 50M) and way above real Transfermarkt value, normalize to real base OVR
            is_promo_card = (row.get("rarity") or "").strip() != "Rare" or to_int(row.get("eaId"), 0) >= 50_000_000
            if is_promo_card and tm_mv > 0:
                real_ovr_cap = tm_mv_to_overall(tm_mv, age) + 2
                if overall > real_ovr_cap + 3:
                    delta = overall - real_ovr_cap
                    overall = real_ovr_cap
                    if not is_gk:
                        pace = max(45, pace - delta)
                        shooting = max(35, shooting - delta)
                        passing = max(40, passing - delta)
                        dribbling = max(42, dribbling - delta)
                        defending = max(30, defending - delta)
                        physicality = max(45, physicality - delta)
                        reflexes = max(45, reflexes - delta)

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

            est_mv = estimate_market_value(overall, age)
            market_value_eur = tm_mv if (tm_mv > 0 and tm_mv >= est_mv * 0.25) else est_mv
            image_url = tm["image_url"] if tm and tm["image_url"] else ""
            contract_until = tm["contract_expiration"] if tm and tm["contract_expiration"] else "2028-06-30"
            wage_eur = estimate_weekly_wage(overall, market_value_eur)

            players.append({
                "id": next_player_id,
                "eaId": to_int(row.get("eaId"), next_player_id),
                "name": player_name,
                "fullName": full_name,
                "clubId": club_id,
                "clubName": club_obj["name"],
                "league": club_obj["league"],
                "overall": overall,
                "potential": min(96, overall + (6 if age <= 21 else 3 if age <= 24 else 1 if age <= 27 else 0)),
                "primaryPosition": primary_pos,
                "positions": raw_positions,
                "roleCategory": role_cat,
                "nationality": (row.get("nation") or club_obj["country"]).strip(),
                "age": age,
                "heightCm": parse_height_cm(row.get("height") or ""),
                "weightKg": parse_weight_kg(row.get("weight") or ""),
                "preferredFoot": (row.get("preferred_foot") or "Right").strip(),
                "weakFoot": to_int(row.get("weak_foot"), 3),
                "skillMoves": to_int(row.get("skill_moves"), 3),
                "accelerateType": (row.get("accelerate_type") or "Controlled").strip(),
                "playstylesPlus": [p.strip() for p in (row.get("playstyles_plus") or "").split(",") if p.strip()],
                "playstylesBase": [p.strip() for p in (row.get("playstyles_base") or "").split(",") if p.strip()],
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

    print(f"[etl] Ingested {len(players)} players from FC27")

    # 3b. Ingest Brazilian players from Transfermarkt
    with gzip.GzipFile(fileobj=io.BytesIO(tm_bytes)) as gz:
        reader = csv.DictReader(io.TextIOWrapper(gz, encoding="utf-8", errors="replace"))
        for row in reader:
            cid_tm = to_int(row.get("current_club_id"), 0)
            if cid_tm not in brazil_club_to_id:
                continue
            club_id = brazil_club_to_id[cid_tm]
            club_obj = clubs[club_id - 1]

            p_name = (row.get("name") or "").strip()
            if not p_name:
                continue

            nationality = (row.get("country_of_citizenship") or "Brasil").strip()
            person_key = (normalize_name(p_name), normalize_name(nationality))
            if person_key in seen_person_keys:
                continue
            seen_person_keys.add(person_key)

            dob = (row.get("date_of_birth") or "1998-01-01")[:4]
            birth_year = to_int(dob, 1998)
            age = max(16, min(42, 2026 - birth_year))

            mv = to_int(row.get("market_value_in_eur"), 0)
            if mv <= 0:
                mv = 800_000
            overall = tm_mv_to_overall(mv, age)

            subpos = row.get("sub_position") or ""
            mainpos = row.get("position") or ""
            prim_pos, role_cat = tm_subpos_to_pos(subpos, mainpos)
            is_gk = prim_pos == "GK"

            face, dstats = generate_player_attributes(overall, role_cat, is_gk)
            wage_eur = estimate_weekly_wage(overall, mv)

            height_cm = to_int(row.get("height_in_cm"), 180)
            foot = (row.get("foot") or "right").capitalize()
            contract = (row.get("contract_expiration_date") or "2028-06-30")[:10]

            players.append({
                "id": next_player_id,
                "eaId": 800000 + next_player_id,
                "name": p_name,
                "fullName": f"{row.get('first_name', '')} {row.get('last_name', '')}".strip() or p_name,
                "clubId": club_id,
                "clubName": club_obj["name"],
                "league": club_obj["league"],
                "overall": overall,
                "potential": min(92, overall + (6 if age <= 21 else 3 if age <= 24 else 1 if age <= 27 else 0)),
                "primaryPosition": prim_pos,
                "positions": [prim_pos],
                "roleCategory": role_cat,
                "nationality": (row.get("country_of_citizenship") or "Brasil").strip(),
                "age": age,
                "heightCm": height_cm,
                "weightKg": 75 if not is_gk else 84,
                "preferredFoot": foot if foot in {"Left", "Right"} else "Right",
                "weakFoot": 3,
                "skillMoves": 3 if role_cat in {"MID", "ATT"} else 2,
                "accelerateType": "Controlled",
                "playstylesPlus": [],
                "playstylesBase": [],
                "fcIqRoles": "",
                "faceStats": face,
                "stats": dstats,
                "imageUrl": (row.get("image_url") or "").strip(),
                "marketValueEur": mv,
                "wageEur": wage_eur,
                "contractUntil": contract,
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

    print(f"[etl] Total real players before squad balancing: {len(players)}")

    # 3c. Ensure Positional Balance & Minimum Squad Size (>= 18) for EVERY club
    first_names_by_country: dict[str, list[str]] = {
        "Inglaterra": ["Jack", "Harry", "George", "Callum", "Liam", "Ethan", "Mason", "Noah", "Lewis", "Dan", "Oliver", "Alfie", "Harvey", "Kieran", "Nathan", "Toby", "Ben", "Josh", "Sam", "Joe"],
        "Espanha": ["Alejandro", "Carlos", "David", "Pablo", "Javier", "Álvaro", "Hugo", "Lucas", "Mateo", "Diego", "Adrián", "Marcos", "Manuel", "Sergio", "Daniel", "Iván", "Rubén", "Raúl", "Iker", "Jorge"],
        "Itália": ["Lorenzo", "Leonardo", "Francesco", "Alessandro", "Mattia", "Federico", "Gabriele", "Matteo", "Andrea", "Riccardo", "Tommaso", "Edoardo", "Filippo", "Davide", "Christian", "Nicolo", "Simone", "Pietro", "Luca", "Marco"],
        "Alemanha": ["Lukas", "Leon", "Finn", "Elias", "Jonas", "Niklas", "Tim", "Paul", "Felix", "Maximilian", "Moritz", "Julian", "Jan", "Tobias", "Florian", "Fabian", "Bastian", "Sebastian", "Simon", "Philipp"],
        "França": ["Lucas", "Théo", "Enzo", "Maxime", "Alexandre", "Hugo", "Antoine", "Clément", "Mathis", "Valentin", "Nathan", "Julien", "Romain", "Florian", "Guillaume", "Adrien", "Nicolas", "Alexis", "Dimitri", "Bastien"],
        "Arábia Saudita": ["Mohammed", "Abdullah", "Ali", "Fahad", "Sultan", "Saud", "Nasser", "Hassan", "Salem", "Turki", "Khaled", "Mansour", "Saad", "Yasser", "Waleed", "Majed", "Bader", "Faisal", "Hussain", "Rayan"],
        "Brasil": ["Gabriel", "Lucas", "Matheus", "Guilherme", "Rafael", "Felipe", "Thiago", "Rodrigo", "Vinicius", "Caio", "Gustavo", "Leonardo", "Renan", "Murilo", "Igor", "Danilo", "Otávio", "Kauã", "Breno", "Vitor"],
        "Portugal": ["Bernardo", "Gonçalo", "Diogo", "Rodrigo", "Afonso", "Martim", "Duarte", "Tomás", "Tiago", "Rui", "Vasco", "Simão", "Henrique", "Lourenço", "Salvador", "Francisco", "João", "Pedro", "Manuel", "António"],
        "Holanda": ["Daan", "Sem", "Lucas", "Milan", "Levi", "Finn", "Jesse", "Lars", "Ruben", "Bram", "Thijs", "Stijn", "Sven", "Niels", "Cas", "Luuk", "Jasper", "Wouter", "Jelle", "Bas"],
        "Estados Unidos": ["Tyler", "Christian", "Weston", "Brendan", "Miles", "Walker", "Antonee", "Caleb", "Jordan", "Paxten", "Johnny", "Bryan", "Auston", "Daryl", "Keaton", "Gianluca", "Caden", "Griffin", "Quinn", "Cole"],
        "Argentina": ["Santiago", "Mateo", "Joaquín", "Facundo", "Agustín", "Tomás", "Lautaro", "Nicolás", "Franco", "Thiago", "Ignacio", "Luciano", "Ramiro", "Julián", "Ezequiel", "Nahuel", "Bautista", "Benjamín", "Valentín", "Enzo"],
        "Turquia": ["Burak", "Emre", "Arda", "Can", "Kerem", "Yusuf", "Barış", "Ferdi", "Oğuz", "Cengiz", "Hakan", "Enes", "Semih", "Cenk", "İsmail", "Merih", "Kaan", "Uğurcan", "Altay", "Zeki"],
        "México": ["Santiago", "Sebastián", "Diego", "Mateo", "Emiliano", "Rodrigo", "Javier", "Carlos", "Luis", "Alejandro", "Guillermo", "Hirving", "Edson", "César", "Orbelín", "Uriel", "Henry", "Alexis", "Erick", "Jesús"],
        "Escócia": ["Callum", "Lewis", "Finlay", "Cameron", "Jack", "Rory", "Euan", "Liam", "Fraser", "Scott", "Ross", "Kieran", "Craig", "Gregor", "Stuart", "Brodie", "Archie", "Murray", "Hamish", "Alasdair"],
    }
    last_names_by_country: dict[str, list[str]] = {
        "Inglaterra": ["Smith", "Jones", "Taylor", "Brown", "Wilson", "Evans", "Thomas", "Roberts", "Walker", "Wright", "Thompson", "White", "Hughes", "Edwards", "Green", "Hall", "Wood", "Clarke", "Cooper", "Ward"],
        "Espanha": ["García", "Martínez", "López", "González", "Rodríguez", "Fernández", "Pérez", "Gómez", "Sánchez", "Díaz", "Moreno", "Muñoz", "Álvarez", "Romero", "Alonso", "Gutiérrez", "Navarro", "Torres", "Domínguez", "Ramos"],
        "Itália": ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa", "Giordano", "Rizzo", "Lombardi", "Moretti"],
        "Alemanha": ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann", "Schäfer", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann"],
        "França": ["Martin", "Bernard", "Thomas", "Petit", "Robert", "Richard", "Durand", "Dubois", "Moreau", "Laurent", "Simon", "Michel", "Lefebvre", "Leroy", "Roux", "David", "Bertrand", "Morel", "Fournier", "Girard"],
        "Arábia Saudita": ["Al-Dawsari", "Al-Shahrani", "Al-Brikan", "Al-Ghamdi", "Al-Muwallad", "Al-Faraj", "Al-Shehri", "Al-Khaibari", "Al-Boushal", "Al-Harbi", "Al-Najei", "Al-Hassan", "Al-Olayan", "Al-Ghannam", "Al-Tambakti", "Al-Amri", "Al-Sulayhim", "Al-Bulaihi", "Al-Hamdan", "Al-Juhani"],
        "Brasil": ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa"],
        "Portugal": ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes", "Gonçalves", "Gomes", "Lopes", "Marques", "Alves", "Almeida", "Ribeiro", "Pinto", "Carvalho", "Teixeira"],
        "Holanda": ["de Jong", "Jansen", "de Vries", "van den Berg", "van Dijk", "Bakker", "Janssen", "Visser", "Smit", "Meijer", "de Boer", "Mulder", "de Groot", "Bos", "Vos", "Peters", "Hendriks", "van Leeuwen", "Dekker", "Brouwer"],
        "Estados Unidos": ["Adams", "Pulisic", "McKennie", "Robinson", "Zimmerman", "Turner", "Morris", "Johnson", "Carter", "Vickers", "Richards", "Scally", "McKenzie", "Aaronson", "De la Torre", "Musah", "Reyna", "Pepi", "Wright", "Ferreira"],
        "Argentina": ["Rodríguez", "González", "Gómez", "Fernández", "López", "Díaz", "Martínez", "Pérez", "García", "Sánchez", "Romero", "Sosa", "Álvarez", "Torres", "Ruiz", "Ramírez", "Flores", "Benítez", "Acosta", "Medina"],
        "Turquia": ["Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Yıldız", "Yıldırım", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara", "Koç", "Kurt", "Özkan", "Şimşek"],
        "México": ["Hernández", "García", "Martínez", "López", "González", "Pérez", "Rodríguez", "Sánchez", "Ramírez", "Cruz", "Flores", "Gómez", "Morales", "Vázquez", "Jiménez", "Reyes", "Díaz", "Torres", "Gutiérrez", "Ruiz"],
        "Escócia": ["Smith", "Brown", "Wilson", "Robertson", "Thomson", "Campbell", "Stewart", "Anderson", "MacDonald", "Scott", "Reid", "Murray", "Taylor", "Clark", "Mitchell", "Ross", "Walker", "Paterson", "Young", "Graham"],
    }

    pos_by_cat = {
        "GK": "GK",
        "DEF": ["CB", "LB", "RB", "CB"],
        "MID": ["CM", "CDM", "CAM", "RM"],
        "ATT": ["ST", "LW", "RW", "ST"],
    }

    used_full_names: set[str] = {p["fullName"].lower() for p in players}

    def make_depth_player(club: dict[str, Any], cat: str, seq_idx: int) -> dict[str, Any]:
        nonlocal next_player_id
        country = club["country"]
        fns = first_names_by_country.get(country, first_names_by_country["Inglaterra"])
        lns = last_names_by_country.get(country, last_names_by_country["Inglaterra"])
        
        full_n = ""
        total_combos = len(fns) * len(lns)
        base_offset = (club["id"] * 17 + seq_idx * 7) % total_combos
        for loop_count in range(1000):
            idx = (base_offset + loop_count) % total_combos
            fn = fns[idx // len(lns)]
            ln = lns[idx % len(lns)]
            suffix = f" {loop_count // total_combos + 1}" if loop_count >= total_combos else ""
            candidate = f"{fn} {ln}{suffix}".strip()
            if candidate.lower() not in used_full_names:
                full_n = candidate
                used_full_names.add(candidate.lower())
                break

        if not full_n:
            full_n = f"Player {club['id']}_{seq_idx}_{next_player_id}"
            used_full_names.add(full_n.lower())

        short_n = f"{full_n.split()[0][0]}. {full_n.split()[-1]}"

        tier = club["tier"]
        base_min = {1: 72, 2: 66, 3: 60, 4: 56}.get(tier, 70)
        overall = base_min + ((club["id"] * 7 + seq_idx * 3) % 5)
        age = 19 + ((club["id"] + seq_idx * 5) % 10)

        pos_list = pos_by_cat[cat]
        primary_pos = pos_list if isinstance(pos_list, str) else pos_list[seq_idx % len(pos_list)]
        is_gk = cat == "GK"

        face, dstats = generate_player_attributes(overall, cat, is_gk)
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
            "league": club["league"],
            "overall": overall,
            "potential": min(86, overall + (6 if age <= 21 else 3)),
            "primaryPosition": primary_pos,
            "positions": [primary_pos],
            "roleCategory": cat,
            "nationality": country,
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
            "faceStats": face,
            "stats": dstats,
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

    # Recalculate accurate club avgOverall from top 16 players
    for club in clubs:
        squad = [p for p in players if p["clubId"] == club["id"]]
        if squad:
            top16 = sorted((p["overall"] for p in squad), reverse=True)[:16]
            club["avgOverall"] = round(sum(top16) / len(top16), 1)

    print(f"[etl] Total players after balancing: {len(players)}")

    # 4. Premier League Fixtures (380 official matches)
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

    # 5. Write SQLite Database (Single unified canonical database)
    if SQLITE_PATH.exists():
        SQLITE_PATH.unlink()
    SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(SQLITE_PATH)
    cur = conn.cursor()

    cur.executescript(
        """
        CREATE TABLE leagues (
            id INTEGER PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            country TEXT NOT NULL,
            flag_emoji TEXT NOT NULL,
            tier INTEGER NOT NULL,
            total_clubs INTEGER NOT NULL
        );

        CREATE TABLE clubs (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            short_name TEXT NOT NULL,
            country TEXT NOT NULL,
            league TEXT NOT NULL,
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
            club_id INTEGER NOT NULL,
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
        "INSERT INTO leagues VALUES (?, ?, ?, ?, ?, ?, ?)",
        [(l["id"], l["code"], l["name"], l["country"], l["flagEmoji"], l["tier"], l["totalClubs"]) for l in LEAGUES_METADATA],
    )

    cur.executemany(
        """
        INSERT INTO clubs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                c["id"], c["name"], c["shortName"], c["country"], c["league"], c["division"], c["tier"],
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

    # 6. Export Unified JSON for Instant Client Loading
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "season": "2026/27",
        "leagues": LEAGUES_METADATA,
        "clubs": clubs,
        "referees": referees,
        "players": players,
        "fixtures": fixtures,
    }
    JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    tm_photos = sum(1 for p in players if p["imageUrl"])
    null_clubs = sum(1 for p in players if p["clubId"] is None)

    print(f"\n[done] Unified Database successfully built!")
    print(f"  SQLite:          {SQLITE_PATH} ({SQLITE_PATH.stat().st_size // 1024} KB)")
    print(f"  JSON:            {JSON_PATH} ({JSON_PATH.stat().st_size // 1024} KB)")
    print(f"  Leagues:         {len(LEAGUES_METADATA)}")
    print(f"  Clubs:           {len(clubs)}")
    print(f"  Players:         {len(players)}")
    print(f"  Null Club IDs:   {null_clubs} (MUST BE 0)")
    print(f"  Fixtures:        {len(fixtures)}")
    print(f"  Referees:        {len(referees)}")
    print(f"  TM Photos:       {tm_photos} / {len(players)}")

if __name__ == "__main__":
    main()
