# Nexboard hinter einem Reverse Proxy betreiben

Ein Reverse Proxy ist empfohlen wenn du:
- **HTTPS / TLS** haben willst
- Nexboard unter einer **eigenen Domain** erreichbar machen willst (z.B. `nexboard.deinserver.de`)
- Mehrere Dienste auf Port 80/443 betreiben willst

---

## Voraussetzungen

Nexboard läuft auf dem Standard-Port `8080` (konfigurierbar in `.env`).  
Der Reverse Proxy leitet HTTPS-Traffic auf `http://localhost:8080` weiter.

---

## Option 1 – Nginx Proxy Manager (NPM)

Einfachster Weg, empfohlen für Einsteiger. Hat eine Web-UI für Zertifikate & Domains.

### docker-compose.yml für NPM (separat, auf demselben Host)

```yaml
services:
  npm:
    image: jc21/nginx-proxy-manager:latest
    container_name: nginx-proxy-manager
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "81:81"      # NPM Admin-UI
    volumes:
      - npm-data:/data
      - npm-letsencrypt:/etc/letsencrypt

volumes:
  npm-data:
  npm-letsencrypt:
```

### NPM Proxy Host einrichten

1. NPM öffnen: `http://deinserver:81`
2. **Hosts → Proxy Hosts → Add Proxy Host**
3. Einstellungen:
   - **Domain Names:** `nexboard.deinserver.de`
   - **Scheme:** `http`
   - **Forward Hostname/IP:** `localhost` (oder Server-IP)
   - **Forward Port:** `8080`
   - ☑ **Websockets Support** aktivieren ← wichtig für SSH-Terminal
4. Tab **SSL:**
   - ☑ **Request a new SSL Certificate**
   - ☑ **Force SSL**
   - E-Mail-Adresse eintragen → Let's Encrypt Zertifikat wird automatisch ausgestellt

---

## Option 2 – Traefik v3

Für fortgeschrittene Setups mit automatischer Service-Discovery.

### docker-compose.yml (Nexboard + Traefik gemeinsam)

```yaml
services:
  traefik:
    image: traefik:v3
    container_name: traefik
    restart: unless-stopped
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=deine@email.de"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-letsencrypt:/letsencrypt
    networks:
      - proxy

  backend:
    build: ./backend
    container_name: nexboard-backend
    restart: unless-stopped
    volumes:
      - nexboard-data:/app/data
    environment:
      - ENV=production
      - NEXBOARD_DATA_DIR=/app/data
      - NEXBOARD_JWT_SECRET=${NEXBOARD_JWT_SECRET:-}
    networks:
      - nexboard
      - proxy

  frontend:
    build: ./frontend
    container_name: nexboard-frontend
    restart: unless-stopped
    depends_on:
      backend:
        condition: service_healthy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.nexboard.rule=Host(`nexboard.deinserver.de`)"
      - "traefik.http.routers.nexboard.entrypoints=websecure"
      - "traefik.http.routers.nexboard.tls.certresolver=letsencrypt"
      - "traefik.http.services.nexboard.loadbalancer.server.port=80"
      # HTTP → HTTPS Redirect
      - "traefik.http.routers.nexboard-http.rule=Host(`nexboard.deinserver.de`)"
      - "traefik.http.routers.nexboard-http.entrypoints=web"
      - "traefik.http.routers.nexboard-http.middlewares=redirect-https"
      - "traefik.http.middlewares.redirect-https.redirectscheme.scheme=https"
    networks:
      - nexboard
      - proxy

networks:
  nexboard:
    driver: bridge
  proxy:
    external: true   # vorher: docker network create proxy

volumes:
  nexboard-data:
    name: nexboard-data
  traefik-letsencrypt:
```

---

## Option 3 – Caddy (einfachstes HTTPS)

Caddy übernimmt TLS automatisch ohne Konfiguration.

```caddyfile
# /etc/caddy/Caddyfile

nexboard.deinserver.de {
    reverse_proxy localhost:8080 {
        # WebSocket-Support für SSH-Terminal
        header_up Upgrade {http.upgrade}
        header_up Connection {http.connection}
    }
}
```

---

## DNS-Setup

Damit `nexboard.deinserver.de` funktioniert, muss ein **A-Record** in deinen DNS-Einstellungen auf die IP deines Servers zeigen:

```
nexboard.deinserver.de.  →  A  →  123.456.789.0
```

---

## Wichtiger Hinweis: WebSocket

Der SSH-Terminal und zukünftige Features nutzen **WebSockets**.  
Stelle sicher, dass dein Reverse Proxy WebSocket-Verbindungen weiterleitet.  
Die nginx.conf von Nexboard ist bereits korrekt konfiguriert (`Upgrade`, `Connection`).

