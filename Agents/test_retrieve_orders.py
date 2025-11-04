import os
import sys

# Proje kökünü ve Agents klasörünü path'e ekle
PROJECT_ROOT = "/Users/gurkanmutlu/repository/gurkan/AdGen"
AGENTS_DIR = os.path.join(PROJECT_ROOT, "Agents")
if AGENTS_DIR not in sys.path:
    sys.path.insert(0, AGENTS_DIR)

# .env yüklemeyi dene (varsa)
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(os.path.join(AGENTS_DIR, "DataAnalyticAgent", ".env"))
except Exception:
    pass

# Gerekli env değişkenlerini garantiye al
os.environ.setdefault("GCP_PROJECT_ID", "eighth-upgrade-475017-u5")
os.environ.setdefault(
    "GOOGLE_APPLICATION_CREDENTIALS",
    os.path.join(AGENTS_DIR, "eighth-upgrade-475017-u5-5f7f40ad1003.json"),
)
os.environ.setdefault(
    "GOOGLE_APPLICATION_CREDENTIALS_BQ",
    os.path.join(PROJECT_ROOT, "adg-ecommerce", "eighth-upgrade-475017-u5-95fdc326baca.json"),
)

from DataAnalyticAgent.agent import retrieve_orders  # noqa: E402


def main():
    user_ids = ["user_519b88b4-9382-4bd3-b455-41ed22318db9"]
    try:
        result = retrieve_orders(user_ids)
        try:
            rows = len(result)
        except Exception:
            rows = "?"
        print(f"✅ retrieve_orders OK — rows: {rows}")
        # İlk 5 kaydı güzelce göster (liste/dict veya DataFrame destekler)
        try:
            import pandas as pd
            if isinstance(result, list):
                preview = pd.DataFrame(result).head(5)
                print(preview.to_string(index=False))
            else:
                print(result.head(5).to_string(index=False))
        except Exception:
            print(result)
    except Exception as e:
        print(f"❌ retrieve_orders hata: {e}")


if __name__ == "__main__":
    main()
