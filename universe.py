"""
Asset universe tracked by Market Movers.

Every symbol uses Yahoo Finance notation:
  * Crypto   ->  BTC-USD
  * Stocks   ->  AAPL
  * Indices  ->  ^GSPC
  * Futures  ->  GC=F
  * Forex    ->  EURUSD=X

Add / remove tickers freely — symbols that fail to load are skipped automatically.
"""

CATEGORY_META = [
    {"id": "crypto",      "label": "Crypto",      "icon": "₿", "color": "#f7931a"},
    {"id": "stocks",      "label": "Stocks",      "icon": "◧", "color": "#4f8cff"},
    {"id": "indices",     "label": "Indices",     "icon": "∑", "color": "#a78bfa"},
    {"id": "metals",      "label": "Metals",      "icon": "◆", "color": "#facc15"},
    {"id": "energy",      "label": "Energy",      "icon": "ϟ", "color": "#fb7185"},
    {"id": "agriculture", "label": "Agriculture", "icon": "✿", "color": "#4ade80"},
    {"id": "futures",     "label": "Futures",     "icon": "⧗", "color": "#22d3ee"},
    {"id": "forex",       "label": "Forex",       "icon": "⇄", "color": "#f472b6"},
]

UNIVERSE = {
    "crypto": [
        ("BTC-USD", "Bitcoin"), ("ETH-USD", "Ethereum"), ("SOL-USD", "Solana"),
        ("BNB-USD", "BNB"), ("XRP-USD", "XRP"), ("ADA-USD", "Cardano"),
        ("DOGE-USD", "Dogecoin"), ("AVAX-USD", "Avalanche"), ("DOT-USD", "Polkadot"),
        ("LINK-USD", "Chainlink"), ("LTC-USD", "Litecoin"), ("TRX-USD", "TRON"),
        ("SHIB-USD", "Shiba Inu"), ("BCH-USD", "Bitcoin Cash"), ("XLM-USD", "Stellar"),
        ("ATOM-USD", "Cosmos"), ("NEAR-USD", "NEAR Protocol"), ("HBAR-USD", "Hedera"),
        ("ETC-USD", "Ethereum Classic"), ("UNI7083-USD", "Uniswap"),
    ],
    "stocks": [
        ("AAPL", "Apple"), ("MSFT", "Microsoft"), ("NVDA", "NVIDIA"),
        ("AMZN", "Amazon"), ("GOOGL", "Alphabet"), ("META", "Meta Platforms"),
        ("TSLA", "Tesla"), ("AVGO", "Broadcom"), ("AMD", "AMD"),
        ("NFLX", "Netflix"), ("JPM", "JPMorgan Chase"), ("V", "Visa"),
        ("WMT", "Walmart"), ("XOM", "Exxon Mobil"), ("BA", "Boeing"),
        ("INTC", "Intel"), ("DIS", "Disney"), ("PFE", "Pfizer"),
        ("KO", "Coca-Cola"), ("NKE", "Nike"), ("ORCL", "Oracle"),
        ("CRM", "Salesforce"), ("UBER", "Uber"), ("COIN", "Coinbase"),
        ("PLTR", "Palantir"), ("BRK-B", "Berkshire Hathaway"), ("LLY", "Eli Lilly"),
        ("UNH", "UnitedHealth"), ("MSTR", "Strategy"), ("SMCI", "Super Micro"),
    ],
    "indices": [
        ("^GSPC", "S&P 500"), ("^DJI", "Dow Jones"), ("^IXIC", "Nasdaq Composite"),
        ("^RUT", "Russell 2000"), ("^VIX", "CBOE Volatility"), ("^FTSE", "FTSE 100"),
        ("^GDAXI", "DAX"), ("^FCHI", "CAC 40"), ("^STOXX50E", "Euro Stoxx 50"),
        ("^N225", "Nikkei 225"), ("^HSI", "Hang Seng"), ("000001.SS", "Shanghai Composite"),
        ("^KS11", "KOSPI"), ("^BSESN", "BSE Sensex"), ("^NSEI", "Nifty 50"),
        ("^AXJO", "ASX 200"), ("^GSPTSE", "TSX Composite"), ("^BVSP", "Bovespa"),
    ],
    "metals": [
        ("GC=F", "Gold"), ("SI=F", "Silver"), ("HG=F", "Copper"),
        ("PL=F", "Platinum"), ("PA=F", "Palladium"), ("ALI=F", "Aluminum"),
        ("HRC=F", "Hot-Rolled Steel"),
    ],
    "energy": [
        ("CL=F", "Crude Oil WTI"), ("BZ=F", "Brent Crude"), ("NG=F", "Natural Gas"),
        ("RB=F", "RBOB Gasoline"), ("HO=F", "Heating Oil"),
    ],
    "agriculture": [
        ("ZC=F", "Corn"), ("ZW=F", "Wheat"), ("KE=F", "KC HRW Wheat"),
        ("ZS=F", "Soybeans"), ("ZM=F", "Soybean Meal"), ("ZL=F", "Soybean Oil"),
        ("ZO=F", "Oats"), ("ZR=F", "Rough Rice"), ("KC=F", "Coffee"),
        ("CC=F", "Cocoa"), ("SB=F", "Sugar #11"), ("CT=F", "Cotton"),
        ("OJ=F", "Orange Juice"), ("LE=F", "Live Cattle"), ("GF=F", "Feeder Cattle"),
        ("HE=F", "Lean Hogs"), ("LBR=F", "Lumber"),
    ],
    "futures": [
        ("ES=F", "E-mini S&P 500"), ("NQ=F", "E-mini Nasdaq 100"), ("YM=F", "E-mini Dow"),
        ("RTY=F", "E-mini Russell 2000"), ("NKD=F", "Nikkei 225 Futures"),
        ("ZB=F", "30Y T-Bond"), ("ZN=F", "10Y T-Note"), ("ZF=F", "5Y T-Note"),
        ("ZT=F", "2Y T-Note"), ("6E=F", "Euro FX"), ("6J=F", "Japanese Yen"),
        ("6B=F", "British Pound"), ("6A=F", "Australian Dollar"), ("6C=F", "Canadian Dollar"),
        ("DX-Y.NYB", "US Dollar Index"), ("BTC=F", "CME Bitcoin"), ("ETH=F", "CME Ether"),
    ],
    "forex": [
        ("EURUSD=X", "EUR/USD"), ("GBPUSD=X", "GBP/USD"), ("JPY=X", "USD/JPY"),
        ("AUDUSD=X", "AUD/USD"), ("NZDUSD=X", "NZD/USD"), ("CAD=X", "USD/CAD"),
        ("CHF=X", "USD/CHF"), ("CNY=X", "USD/CNY"), ("VND=X", "USD/VND"),
        ("KRW=X", "USD/KRW"), ("INR=X", "USD/INR"), ("EURJPY=X", "EUR/JPY"),
    ],
}
