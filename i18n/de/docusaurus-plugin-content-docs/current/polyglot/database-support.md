---
title: Datenbankkompatibilität
---

# Datenbankkompatibilität und Qualifikation

Verwenden Sie diese Tabelle für Datenbanken im eingebetteten Laravel-Modus und für selbst gehosteten Server. Cloud verwaltet seine Laufzeitpersistenz. Cloud-Kunden konfigurieren SDK-Clients und Worker statt einer Laufzeitdatenbank.

Eine erklärte Kompatibilitätsbasis beweist nicht, dass jede neuere Version qualifiziert ist. Quelltests und installierte veröffentlichte Artefakte liefern unterschiedliche Nachweise. Diese Bestandsaufnahme bindet Workflow-2.20.3-Quellcode und Server-3.0.5-Veröffentlichungsnachweise. Sie ändert weder Laufzeitkompatibilität noch legt sie einen getesteten Mindest-/Höchstbereich fest.

| Engine | Erklärte Kompatibilität | Beobachtete Quellqualifikation | Qualifikation veröffentlichter Artefakte |
| --- | --- | --- | --- |
| MySQL | Eingebettet: Basis 8.0. Server: Basis 8.0. | Core: 26.10.0 in den ursprünglichen Feature-Jobs mit variablem Image-Tag. Server-Profile: 8.0.46 und 8.4.5. | Die Core-Beobachtung bindet den veröffentlichten Quellstand. Server 3.0.5 Compose nutzt `mysql:8.0` für Schema-/Health-Smoke, keine vollständige Ausführungs-, Kapazitäts- oder TLS-Qualifikation. |
| PostgreSQL | Eingebettet: Basis 13. Server: Basis 13. | Core: 18.6. Server-Profile: 16.15 und 17.11. | Die Core-Beobachtung bindet den veröffentlichten Quellstand. Im geprüften Bestand wurde kein an den Server-3.0.5-Index gebundener PostgreSQL-Endpunktnachweis gefunden. |
| MariaDB | Eingebettet: Basis 10.5. Server akzeptiert `mariadb`; hier ist keine Versionsbasis festgestellt. | Core: 10.5.29. Server-Profil: 10.11.19. | Die Core-Beobachtung bindet den veröffentlichten Quellstand. Im geprüften Bestand wurde kein an den Server-3.0.5-Index gebundener MariaDB-Endpunktnachweis gefunden. |
| SQLite | Eingebettete Fähigkeiten/Tests umfassen SQLite. Server erklärt Basis 3.35. | Die ursprünglichen Core-Quelljobs gaben keine SQLite-Bibliotheksversion aus. | Die Abnahme des installierten Core 2.20.3 verwendete SQLite, ohne einen Bibliotheksversionsbereich festzulegen. Der Korpus des eingefrorenen Server-3.1.0-Kandidaten bleibt getrennt von Stable 3.0.5. |
| SQL Server | Veröffentlichter eingebetteter Core bewirbt `sqlsrv`, bleibt jedoch unqualifiziert. Server-Qualifikation ist hier nicht festgestellt. | Kein SQL-Server-Job wurde aus der veröffentlichten Core-Matrix ermittelt. Der vorgeschlagene Backend-Guard ist separate Quellarbeit. | Keine entsprechende Veröffentlichungsqualifikation ermittelt. Leiten Sie Unterstützung nicht aus der eingebetteten Fähigkeitsangabe ab. |

## Nachweise einordnen {#reading-the-evidence}

Das [Core-Inventar](https://github.com/durable-workflow/durable-workflow.github.io/issues/347#issuecomment-6642279325) bindet die ursprünglichen Image-Digests und vier MySQL-, vier PostgreSQL- sowie einen MariaDB-Feature-Job am veröffentlichten Quellstand. Seine zwölf veröffentlichten Upgrade-Zellen prüfen Laravel/PHP-Kombinationen, nicht zwölf Datenbankendpunkte. Der separate [Nachweis mit normal installiertem Core](https://github.com/durable-workflow/workflow/pull/1025#issuecomment-6632522927) umfasst 67 SQLite-basierte Stream-/Replay-/Fake-Fälle. Weder PHP-Version noch variables Image-Tag liefern eine nicht ausgegebene Datenbankversion.

Das [Server-Inventar](https://github.com/durable-workflow/server/issues/563#issuecomment-6642659277) trennt native und ältere PHP-Quelljob-Bereiche. Der [Stable-3.0.5-Nachweis](https://github.com/durable-workflow/server/issues/563#issuecomment-6643169603) enthält vier Compose-Smoke-Zellen für Architektur/Profile. `local` und `production` nutzen MySQL. Die geprüften Logs belegen keine genaue Begleitversion/Digest, Schreibkapazitätsqualifikation oder verifiziertes TLS. Quellprofile und eingefrorene Kandidaten qualifizieren kein anderes veröffentlichtes Image.

## Herstellerlebenszyklus und verteilte Engines {#vendor-lifecycle-and-distributed-engines}

Bevorzugen Sie für neue Installationen gepflegte Herstellerlinien, nachdem das genaue Laufzeit-/Datenbankpaar qualifiziert ist. Laut [PostgreSQL-Richtlinie](https://www.postgresql.org/support/versioning/) ist 13 nicht mehr unterstützt, 14 endet am 12. November 2026. [Oracle](https://www.mysql.com/support/eol-notice.html) führt MySQL 8.0 seit 21. April 2026 im Sustaining Support. Herstellerlebenszyklen begründen oder beseitigen unsere Artefaktqualifikation nicht.

TiDB, Vitess, PlanetScale und andere verteilte MySQL-kompatible Bereitstellungen sind hier ungetestet. Protokollkompatibilität beweist weder Transaktionsisolation, Zeilensperren, Commit-/After-Commit-Sichtbarkeit noch Retry-Verhalten. Prüfen Sie diese Semantik mit der genauen Laufzeit vor der Einführung. Die Tabelle erweitert den [Einregion-Betriebsrahmen](../operator-operating-envelope.md) nicht auf mehrere Regionen.
