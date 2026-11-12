"""Fetch Overture Maps places and neighbourhood areas for one bounding box.

Reads straight from Overture's public S3 bucket with DuckDB (httpfs + spatial).
Only the Parquet row groups whose bbox statistics overlap the request are
downloaded, never the whole planet. Writes one raw JSON file that
scripts/city-pack/build.mjs turns into a city pack.

Usage (no install needed beyond uv):
  uv run --with duckdb python -I scripts/city-pack/fetch_overture.py \
    --release 2026-10-21.0 --west -80.07 --south 40.39 --east -79.93 --north 40.49 \
    --out /tmp/boredone-city-packs/pittsburgh.raw.json
"""
import argparse
import json
import re
import time

import duckdb

BUCKET = "s3://overturemaps-us-west-2/release"


def http_bytes(con):
    """(requests, response bytes) so far, from DuckDB's HTTP log."""
    requests = received = 0
    for (message,) in con.sql("SELECT message FROM duckdb_logs WHERE type = 'HTTP'").fetchall():
        requests += 1
        m = re.search(r"Content-Length=(\d+)", message)
        if m:
            received += int(m.group(1))
    return requests, received


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", required=True)
    for side in ("west", "south", "east", "north"):
        ap.add_argument(f"--{side}", type=float, required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d+", a.release):
        raise SystemExit("release must look like 2026-10-21.0")
    if not (a.west < a.east and a.south < a.north):
        raise SystemExit("bbox must have west < east and south < north")

    con = duckdb.connect()
    con.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.sql("SET s3_region='us-west-2';")
    con.sql("CALL enable_logging('HTTP')")
    root = f"{BUCKET}/{a.release}"
    # Overture rows carry a bbox struct; filtering on it lets DuckDB skip row
    # groups by their min/max statistics. A point's bbox is the point itself.
    box = f"bbox.xmin BETWEEN {a.west} AND {a.east} AND bbox.ymin BETWEEN {a.south} AND {a.north}"
    started = time.time()
    con.sql(f"""
      CREATE TABLE places AS
      SELECT id, names.primary AS name, geometry,
             ST_Y(geometry) AS lat, ST_X(geometry) AS lng,
             confidence, operating_status, basic_category,
             taxonomy.primary AS taxonomy_primary, taxonomy.hierarchy AS taxonomy_hierarchy,
             taxonomy.alternates AS taxonomy_alternates,
             websites, addresses, brand.names.primary AS brand,
             [s FOR s IN sources IF s.property = ''] AS record_sources
      FROM read_parquet('{root}/theme=places/type=place/*', hive_partitioning=1)
      WHERE {box}
    """)
    places_secs = time.time() - started
    places_bytes = http_bytes(con)[1]
    # Neighbourhood polygons. Overture division areas come from OpenStreetMap
    # and other open sources; macrohoods are larger groupings of neighbourhoods.
    con.sql(f"""
      CREATE TABLE hoods AS
      SELECT id, division_id, names.primary AS name, subtype, geometry, ST_Area(geometry) AS area
      FROM read_parquet('{root}/theme=divisions/type=division_area/*', hive_partitioning=1)
      WHERE subtype IN ('neighborhood', 'macrohood')
        AND bbox.xmax >= {a.west} AND bbox.xmin <= {a.east}
        AND bbox.ymax >= {a.south} AND bbox.ymin <= {a.north}
    """)
    # Many neighbourhoods exist only as a labelled point, with no boundary
    # (e.g. most of Columbus, downtown Pittsburgh). Keep those points so the
    # mapping step can fall back to the nearest one.
    point_rows = con.sql(f"""
      SELECT names.primary AS name, subtype, ST_Y(geometry) AS lat, ST_X(geometry) AS lng
      FROM read_parquet('{root}/theme=divisions/type=division/*', hive_partitioning=1)
      WHERE subtype IN ('neighborhood', 'macrohood')
        AND bbox.xmin BETWEEN {a.west - 0.01} AND {a.east + 0.01}
        AND bbox.ymin BETWEEN {a.south - 0.01} AND {a.north + 0.01}
        AND id NOT IN (SELECT division_id FROM hoods WHERE division_id IS NOT NULL)
        AND names.primary IS NOT NULL
    """)
    hood_points = [dict(zip(point_rows.columns, r)) for r in point_rows.fetchall()]
    # Prefer the smallest containing neighbourhood, then a macrohood.
    rows = con.sql("""
      WITH hits AS (
        SELECT p.id, h.name, h.subtype,
               row_number() OVER (PARTITION BY p.id
                 ORDER BY CASE h.subtype WHEN 'neighborhood' THEN 0 ELSE 1 END, h.area) AS rank
        FROM places p JOIN hoods h ON ST_Contains(h.geometry, p.geometry)
      )
      SELECT p.* EXCLUDE (geometry), hits.name AS neighborhood, hits.subtype AS neighborhood_type
      FROM places p LEFT JOIN hits ON hits.id = p.id AND hits.rank = 1
    """)
    cols = rows.columns
    records = [dict(zip(cols, r)) for r in rows.fetchall()]
    hood_count = con.sql("SELECT subtype, count(*) FROM hoods GROUP BY 1").fetchall()
    total_secs = time.time() - started

    requests, received = http_bytes(con)

    for r in records:
        r["record_sources"] = [
            {k: s.get(k) for k in ("dataset", "license", "record_id", "update_time")}
            for s in (r.get("record_sources") or [])
        ]
    out = {
        "release": a.release,
        "bbox": {"west": a.west, "south": a.south, "east": a.east, "north": a.north},
        "fetch": {
            "placesSeconds": round(places_secs, 2),
            "totalSeconds": round(total_secs, 2),
            "httpRequests": requests,
            "bytesReceived": received,
            "placesBytesReceived": places_bytes,
            "neighborhoodAreas": {k: v for k, v in hood_count},
            "neighborhoodPointsOnly": len(hood_points),
        },
        "neighborhoodPoints": hood_points,
        "places": records,
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, default=str)
    print(json.dumps({"rows": len(records), **out["fetch"]}))


if __name__ == "__main__":
    main()
