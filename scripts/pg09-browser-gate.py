def gate(b,table_count=31):
 return any(c["name"]=="09-concurrent-reservation-one-winner" and c["status"]=="PASS" for c in b.REPORT["checks"]) and all(c["status"]=="PASS" for c in b.REPORT["checks"])
