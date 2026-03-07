<?php
/**
 * Fiscal NF-e/NFC-e Microservice — Entry Point
 *
 * Routes:
 *   POST /nfe/emit     — Emit NF-e (modelo 55)
 *   POST /nfce/emit    — Emit NFC-e (modelo 65)
 *   POST /nfe/cancel   — Cancel NF-e/NFC-e
 *   POST /nfe/correct  — Carta de Correção (CC-e)
 *   GET  /nfe/status   — SEFAZ service status check
 *   GET  /health       — Health check (no auth)
 */

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use App\NFeService;
use App\Auth;

// ─── CORS & Headers ───
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Api-Key, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ─── Routing ───
$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = rtrim($uri, '/');

// Health check — no auth
if ($uri === '/health' && $method === 'GET') {
    echo json_encode([
        'status' => 'ok',
        'service' => 'fiscal-nfe',
        'version' => '1.0.0',
        'php' => PHP_VERSION,
        'timestamp' => date('c'),
    ]);
    exit;
}

// ─── Auth Check ───
if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// ─── Parse JSON body ───
$body = null;
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON body']);
        exit;
    }
}

// ─── Route handlers ───
try {
    $service = new NFeService();

    switch ($uri) {
        case '/nfe/emit':
            if ($method !== 'POST') { methodNotAllowed(); }
            $result = $service->emit($body, '55');
            respond($result);
            break;

        case '/nfce/emit':
            if ($method !== 'POST') { methodNotAllowed(); }
            $result = $service->emit($body, '65');
            respond($result);
            break;

        case '/nfe/cancel':
            if ($method !== 'POST') { methodNotAllowed(); }
            $result = $service->cancel($body);
            respond($result);
            break;

        case '/nfe/correct':
            if ($method !== 'POST') { methodNotAllowed(); }
            $result = $service->correct($body);
            respond($result);
            break;

        case '/nfe/status':
            if ($method !== 'GET') { methodNotAllowed(); }
            $uf = $_GET['uf'] ?? '35'; // default SP
            $env = $_GET['env'] ?? '2'; // default homologação
            $result = $service->statusServico($uf, $env);
            respond($result);
            break;

        default:
            http_response_code(404);
            echo json_encode(['error' => 'Route not found', 'uri' => $uri]);
    }
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Internal server error',
        'message' => $e->getMessage(),
        'trace' => getenv('APP_DEBUG') ? $e->getTraceAsString() : null,
    ]);
}

// ─── Helpers ───

function respond(array $result): void
{
    $code = ($result['ok'] ?? false) ? 200 : 422;
    http_response_code($code);
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function methodNotAllowed(): void
{
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}
