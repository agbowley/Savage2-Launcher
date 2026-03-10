use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::net::UdpSocket;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use phpserz::{PhpParser, PhpToken};

// K2 protocol constants
const NONRELIABLE_SEQUENCE: u32 = 0xF1B4A29A;
const PACKET_NORMAL: u8 = 0x01;
const NETCMD_INFO_REQUEST: u8 = 0x01;
const NETCMD_INFO: u8 = 0x02;
const HEADER_SIZE: usize = 7; // uint32 seq + uint8 flags + uint16 clientID

const MASTER_SERVER_URL: &str =
    "https://masterserver1.talesofnewerth.com/irc_updater/svr_request_pub.php";
const MASTER_CACHE_SECONDS: u64 = 10;
const UDP_TIMEOUT_MS: u64 = 3000;

/// Cached master server data
static MASTER_CACHE: Mutex<Option<(Vec<MasterServerEntry>, Instant)>> = Mutex::new(None);

/// Cache of last-seen UDP results per server ID.
/// Keeps the most recent successful UDP response for each server so that
/// if a server temporarily stops responding, we still show its last-known data.
static LAST_SEEN: Mutex<Option<HashMap<String, (ServerEntry, Instant)>>> = Mutex::new(None);

/// An entry from the master server's PHP-serialized response.
#[derive(Debug, Clone)]
struct MasterServerEntry {
    id: String,
    ip: String,
    port: u16,
    description: String,
    official: bool,
    min_level: u32,
    max_level: u32,
}

/// Data parsed from a UDP NETCMD_INFO response.
#[derive(Debug)]
struct UdpServerInfo {
    server_name: String,
    num_players: u8,
    max_players: u8,
    game_time: String,
    map: String,
    next_map: String,
    location: String,
    min_players: u8,
    version: String,
    passworded: bool,
}

/// The final server entry sent to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerEntry {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub players: u8,
    pub max_players: u8,
    pub description: String,
    pub official: bool,
    pub min_level: u32,
    pub max_level: u32,
    pub in_game: bool,
    pub game_time: String,
    pub map: String,
    pub next_map: String,
    pub location: String,
    pub min_players: u8,
    pub version: String,
    pub passworded: bool,
    pub ping: u32,
    pub online: bool,
}

// ── Master server ───────────────────────────────────────────────────────

/// Fetch the server list from the master server, using a 30-second cache.
async fn fetch_master_list() -> Result<Vec<MasterServerEntry>, String> {
    // Check cache
    {
        let cache = MASTER_CACHE.lock().map_err(|e| e.to_string())?;
        if let Some((ref entries, ref ts)) = *cache {
            if ts.elapsed() < Duration::from_secs(MASTER_CACHE_SECONDS) {
                return Ok(entries.clone());
            }
        }
    }

    let client = reqwest::Client::new();
    let resp = client
        .post(MASTER_SERVER_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body("f=get_online")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("Master server request failed: {e}"))?;

    let body = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read master server response: {e}"))?;

    let entries = parse_php_server_list(&body)?;

    // Update cache
    {
        let mut cache = MASTER_CACHE.lock().map_err(|e| e.to_string())?;
        *cache = Some((entries.clone(), Instant::now()));
    }

    Ok(entries)
}

/// Parse the PHP-serialized server list into MasterServerEntry values.
fn parse_php_server_list(data: &[u8]) -> Result<Vec<MasterServerEntry>, String> {
    let mut parser = PhpParser::new(data);

    // Top level: array of servers
    let top = parser
        .read_token()
        .map_err(|e| format!("PHP parse error: {e}"))?;
    let num_servers = match top {
        PhpToken::Array { elements } => elements,
        _ => return Err("Expected PHP array at top level".into()),
    };

    let mut entries = Vec::new();

    for _ in 0..num_servers {
        // Read key (server ID) — skip it
        let _key = parser.read_token().map_err(|e| format!("PHP parse error: {e}"))?;

        // Read value — should be an inner array
        let inner = parser.read_token().map_err(|e| format!("PHP parse error: {e}"))?;
        let num_fields = match inner {
            PhpToken::Array { elements } => elements,
            _ => continue,
        };

        let mut fields: HashMap<String, String> = HashMap::new();
        for _ in 0..num_fields {
            let k = parser.read_token().map_err(|e| format!("PHP parse error: {e}"))?;
            let v = parser.read_token().map_err(|e| format!("PHP parse error: {e}"))?;
            let key = token_to_string(&k);
            let val = token_to_string(&v);
            fields.insert(key, val);
        }

        // Consume End token for inner array
        let _ = parser.next_token();

        let port_str = fields.get("port").cloned().unwrap_or_default();
        let port: u16 = port_str.parse().unwrap_or(11235);

        entries.push(MasterServerEntry {
            id: fields.get("id").cloned().unwrap_or_default(),
            ip: fields.get("ip").cloned().unwrap_or_default(),
            port,
            description: fields.get("description").cloned().unwrap_or_default(),
            official: fields.get("official").map_or(false, |v| v == "1"),
            min_level: fields
                .get("minlevel")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0),
            max_level: fields
                .get("maxlevel")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0),
        });
    }

    Ok(entries)
}

/// Convert a PHP token to a string.
fn token_to_string(token: &PhpToken) -> String {
    match token {
        PhpToken::String(s) => String::from_utf8_lossy(s.as_bytes()).to_string(),
        PhpToken::Integer(i) => i.to_string(),
        PhpToken::Float(f) => f.to_string(),
        PhpToken::Boolean(b) => if *b { "1" } else { "0" }.to_string(),
        PhpToken::Null => String::new(),
        _ => String::new(),
    }
}

// ── UDP protocol ────────────────────────────────────────────────────────

/// Build a K2 NETCMD_INFO_REQUEST packet (12 bytes).
fn build_info_request(server_num: i32) -> Vec<u8> {
    let mut pkt = Vec::with_capacity(12);
    // Header: uint32 LE sequence, uint8 flags, uint16 LE clientID
    pkt.extend_from_slice(&NONRELIABLE_SEQUENCE.to_le_bytes());
    pkt.push(PACKET_NORMAL);
    pkt.extend_from_slice(&0u16.to_le_bytes());
    // Payload: int8 cmd, int32 LE server_num
    pkt.push(NETCMD_INFO_REQUEST);
    pkt.extend_from_slice(&server_num.to_le_bytes());
    pkt
}

/// Read a null-terminated C string from a byte slice at the given offset.
/// Returns (string, new_offset) or None if no null terminator is found.
fn read_cstring(data: &[u8], offset: usize) -> Option<(String, usize)> {
    let remaining = data.get(offset..)?;
    let null_pos = remaining.iter().position(|&b| b == 0)?;
    let s = String::from_utf8_lossy(&remaining[..null_pos]).to_string();
    Some((s, offset + null_pos + 1))
}

/// Parse a UDP NETCMD_INFO response.
fn parse_info_response(data: &[u8]) -> Option<UdpServerInfo> {
    if data.len() < HEADER_SIZE + 1 {
        return None;
    }

    let mut pos = HEADER_SIZE;

    // Command byte
    let cmd = *data.get(pos)?;
    pos += 1;
    if cmd != NETCMD_INFO {
        return None;
    }

    // server_num (i32 LE) — skip
    if pos + 4 > data.len() {
        return None;
    }
    pos += 4;

    let (server_name, new_pos) = read_cstring(data, pos)?;
    pos = new_pos;

    let num_players = *data.get(pos)?;
    pos += 1;
    let max_players = *data.get(pos)?;
    pos += 1;

    let (game_time, new_pos) = read_cstring(data, pos)?;
    pos = new_pos;
    let (map, new_pos) = read_cstring(data, pos)?;
    pos = new_pos;
    let (next_map, new_pos) = read_cstring(data, pos)?;
    pos = new_pos;
    let (location, new_pos) = read_cstring(data, pos)?;
    pos = new_pos;

    let min_players = *data.get(pos)?;
    pos += 1;
    let _sandbox = *data.get(pos)?;
    pos += 1;

    let (_races, new_pos) = read_cstring(data, pos)?;
    pos = new_pos;
    let (version, new_pos) = read_cstring(data, pos)?;
    pos = new_pos;

    let passworded = *data.get(pos)? != 0;

    Some(UdpServerInfo {
        server_name: strip_colour_codes(&server_name),
        num_players,
        max_players,
        game_time: strip_colour_codes(&game_time),
        map: strip_colour_codes(&map),
        next_map: strip_colour_codes(&next_map),
        location: strip_colour_codes(&location),
        min_players,
        version: strip_colour_codes(&version),
        passworded,
    })
}

/// Query a single game server via UDP, returning info and ping in ms.
fn query_server_udp(ip: &str, port: u16) -> Option<(UdpServerInfo, u32)> {
    let addr = format!("{ip}:{port}");
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket
        .set_read_timeout(Some(Duration::from_millis(UDP_TIMEOUT_MS)))
        .ok()?;

    let pkt = build_info_request(1);
    let start = Instant::now();
    socket.send_to(&pkt, &addr).ok()?;

    let mut buf = [0u8; 4096];
    let (n, _) = socket.recv_from(&mut buf).ok()?;
    let ping = start.elapsed().as_millis() as u32;

    let info = parse_info_response(&buf[..n])?;
    Some((info, ping))
}

// ── Helpers ─────────────────────────────────────────────────────────────

/// Strip K2 colour codes (^X where X is any character) from a string.
fn strip_colour_codes(s: &str) -> String {
    let re = Regex::new(r"\^.").unwrap();
    re.replace_all(s, "").to_string()
}

/// Parse a game_time string like "02:15" into whether the game is in progress.
fn is_in_game(game_time: &str) -> bool {
    let trimmed = game_time.trim();
    !trimmed.is_empty() && trimmed != "Waiting" && trimmed != "0:00" && trimmed != "00:00"
}

// ── Tauri command ───────────────────────────────────────────────────────

#[tauri::command(async)]
pub async fn fetch_servers() -> Result<Vec<ServerEntry>, String> {
    let master_entries = fetch_master_list().await?;

    // Query all servers via UDP in parallel using blocking threads
    let mut handles = Vec::new();
    for entry in &master_entries {
        let ip = entry.ip.clone();
        let port = entry.port;
        handles.push(tokio::task::spawn_blocking(move || {
            query_server_udp(&ip, port)
        }));
    }

    let mut results: Vec<Option<(UdpServerInfo, u32)>> = Vec::with_capacity(handles.len());
    for handle in handles {
        let result = handle.await.unwrap_or(None);
        results.push(result);
    }

    let now = Instant::now();

    // Update LAST_SEEN cache with fresh UDP responses
    let mut cache = LAST_SEEN.lock().map_err(|e| e.to_string())?;
    let seen = cache.get_or_insert_with(HashMap::new);

    for (master, udp_result) in master_entries.iter().zip(results.iter()) {
        if let Some((info, ping)) = udp_result {
            let entry = ServerEntry {
                id: master.id.clone(),
                name: info.server_name.clone(),
                ip: master.ip.clone(),
                port: master.port,
                players: info.num_players,
                max_players: info.max_players,
                description: master.description.clone(),
                official: master.official,
                min_level: master.min_level,
                max_level: master.max_level,
                in_game: is_in_game(&info.game_time),
                game_time: info.game_time.clone(),
                map: info.map.clone(),
                next_map: info.next_map.clone(),
                location: info.location.clone(),
                min_players: info.min_players,
                version: info.version.clone(),
                passworded: info.passworded,
                ping: *ping,
                online: true,
            };
            seen.insert(master.id.clone(), (entry, now));
        }
    }

    // Build output: only include servers that have responded to UDP at least once.
    // - If UDP responded this cycle → live data (online=true)
    // - Else if we have cached UDP data → show cached info (online=false)
    // - Else (never responded) → skip entirely (stale master entry)
    let servers: Vec<ServerEntry> = master_entries
        .iter()
        .zip(results.iter())
        .filter_map(|(master, udp_result)| {
            if udp_result.is_some() {
                // Just inserted above, guaranteed present
                Some(seen.get(&master.id).unwrap().0.clone())
            } else if let Some((cached, _)) = seen.get(&master.id) {
                // Previously responded, temporarily offline
                let mut stale = cached.clone();
                stale.online = false;
                stale.ping = 0;
                Some(stale)
            } else {
                // Never responded to UDP — stale master entry, skip
                None
            }
        })
        .collect();

    // Evict cache entries no longer in the master list
    let master_ids: std::collections::HashSet<String> =
        master_entries.iter().map(|e| e.id.clone()).collect();
    seen.retain(|id, _| master_ids.contains(id));

    drop(cache);

    Ok(servers)
}
