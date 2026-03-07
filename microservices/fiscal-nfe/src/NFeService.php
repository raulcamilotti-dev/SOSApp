<?php
/**
 * NFeService — NF-e / NFC-e emission, cancellation & correction via sped-nfe.
 *
 * Receives the JSON payload built by services/nfe-builder.ts and calls SEFAZ
 * through the nfephp-org/sped-nfe library.
 *
 * Expected payload structure (POST /nfe/emit or /nfce/emit):
 * {
 *   "type": "nfe"|"nfce",
 *   "environment": 1|2,           // 1=production, 2=homologation
 *   "certificate_pfx_base64": "...",
 *   "certificate_password": "...",
 *   "csc": "...",                  // NFC-e only
 *   "csc_id": "...",               // NFC-e only
 *   "infNFe": { ide, emit, dest, det[], total, transp, pag, infAdic }
 * }
 */

declare(strict_types=1);

namespace App;

use NFePHP\NFe\Make;
use NFePHP\NFe\Tools;
use NFePHP\NFe\Common\Standardize;
use NFePHP\Common\Certificate;

class NFeService
{
    private string $storageDir;

    public function __construct()
    {
        $this->storageDir = __DIR__ . '/../storage';
        if (!is_dir($this->storageDir)) {
            mkdir($this->storageDir, 0755, true);
        }
    }

    /**
     * Emit NF-e (modelo 55) or NFC-e (modelo 65).
     *
     * @param array $payload JSON payload from nfe-builder.ts
     * @param string $modelo '55' for NF-e, '65' for NFC-e
     * @return array { ok: bool, access_key?, xml_signed?, protocol?, error? }
     */
    public function emit(array $payload, string $modelo = '55'): array
    {
        try {
            // ── 1. Validate required fields ──
            $required = ['certificate_pfx_base64', 'certificate_password', 'infNFe'];
            foreach ($required as $field) {
                if (empty($payload[$field])) {
                    return ['ok' => false, 'error' => "Campo obrigatório ausente: {$field}"];
                }
            }

            if ($modelo === '65') {
                if (empty($payload['csc']) || empty($payload['csc_id'])) {
                    return ['ok' => false, 'error' => 'CSC e CSC_ID são obrigatórios para NFC-e'];
                }
            }

            $infNFe = $payload['infNFe'];
            $environment = (int)($payload['environment'] ?? 2); // default homologação

            // ── 2. Build the XML using sped-nfe Make ──
            $nfe = new Make();

            // infNFe tag
            $nfe->taginfNFe((object)[
                'versao' => '4.00',
            ]);

            // ide — identification
            $ide = $infNFe['ide'];
            $nfe->tagide((object)[
                'cUF'      => $ide['cUF'],
                'cNF'      => $ide['cNF'] ?? str_pad((string)random_int(10000000, 99999999), 8, '0', STR_PAD_LEFT),
                'natOp'    => $ide['natOp'] ?? 'VENDA',
                'mod'      => $modelo,
                'serie'    => $ide['serie'] ?? 1,
                'nNF'      => $ide['nNF'],
                'dhEmi'    => $ide['dhEmi'],
                'tpNF'     => $ide['tpNF'] ?? 1,     // 1=saída
                'idDest'   => $ide['idDest'] ?? 1,    // 1=interna
                'cMunFG'   => $ide['cMunFG'],
                'tpImp'    => $modelo === '65' ? 4 : ($ide['tpImp'] ?? 1),
                'tpEmis'   => $ide['tpEmis'] ?? 1,    // 1=normal
                'tpAmb'    => $environment,
                'finNFe'   => $ide['finNFe'] ?? 1,    // 1=normal
                'indFinal' => $ide['indFinal'] ?? 1,  // 1=consumidor final
                'indPres'  => $ide['indPres'] ?? 1,   // 1=presencial
                'procEmi'  => 0,                       // emissão com app do contribuinte
                'verProc'  => 'RadulPlatform 1.0',
            ]);

            // emit — emitter
            $emit = $infNFe['emit'];
            $nfe->tagemit((object)[
                'CNPJ'  => preg_replace('/\D/', '', $emit['CNPJ']),
                'xNome' => $emit['xNome'],
                'xFant' => $emit['xFant'] ?? $emit['xNome'],
                'IE'    => preg_replace('/\D/', '', $emit['IE'] ?? ''),
                'IM'    => $emit['IM'] ?? null,
                'CRT'   => $emit['CRT'] ?? 3,
            ]);

            $nfe->tagenderEmit((object)[
                'xLgr'    => $emit['enderEmit']['xLgr'],
                'nro'     => $emit['enderEmit']['nro'] ?? 'S/N',
                'xCpl'    => $emit['enderEmit']['xCpl'] ?? null,
                'xBairro' => $emit['enderEmit']['xBairro'],
                'cMun'    => $emit['enderEmit']['cMun'],
                'xMun'    => $emit['enderEmit']['xMun'],
                'UF'      => $emit['enderEmit']['UF'],
                'CEP'     => preg_replace('/\D/', '', $emit['enderEmit']['CEP'] ?? ''),
                'cPais'   => '1058',
                'xPais'   => 'BRASIL',
                'fone'    => preg_replace('/\D/', '', $emit['enderEmit']['fone'] ?? '') ?: null,
            ]);

            // dest — recipient
            $dest = $infNFe['dest'] ?? null;
            if ($dest && !empty($dest['xNome'])) {
                $destDoc = [];
                $cpf = preg_replace('/\D/', '', $dest['CPF'] ?? '');
                $cnpj = preg_replace('/\D/', '', $dest['CNPJ'] ?? '');

                if (!empty($cnpj) && strlen($cnpj) === 14) {
                    $destDoc['CNPJ'] = $cnpj;
                } elseif (!empty($cpf) && strlen($cpf) === 11) {
                    $destDoc['CPF'] = $cpf;
                }

                $nfe->tagdest((object)array_merge($destDoc, [
                    'xNome'    => $dest['xNome'],
                    'indIEDest'=> $dest['indIEDest'] ?? 9, // 9=não contribuinte
                    'IE'       => $dest['IE'] ?? null,
                    'email'    => $dest['email'] ?? null,
                ]));

                if (!empty($dest['enderDest'])) {
                    $endDest = $dest['enderDest'];
                    $nfe->tagenderDest((object)[
                        'xLgr'    => $endDest['xLgr'] ?? 'NAO INFORMADO',
                        'nro'     => $endDest['nro'] ?? 'S/N',
                        'xCpl'    => $endDest['xCpl'] ?? null,
                        'xBairro' => $endDest['xBairro'] ?? 'NAO INFORMADO',
                        'cMun'    => $endDest['cMun'] ?? $ide['cMunFG'],
                        'xMun'    => $endDest['xMun'] ?? 'NAO INFORMADO',
                        'UF'      => $endDest['UF'] ?? substr((string)$ide['cUF'], 0, 2),
                        'CEP'     => preg_replace('/\D/', '', $endDest['CEP'] ?? '') ?: null,
                        'cPais'   => '1058',
                        'xPais'   => 'BRASIL',
                        'fone'    => preg_replace('/\D/', '', $endDest['fone'] ?? '') ?: null,
                    ]);
                }
            }

            // det — items
            $items = $infNFe['det'] ?? [];
            if (empty($items)) {
                return ['ok' => false, 'error' => 'Nenhum item (det) encontrado no payload'];
            }

            foreach ($items as $i => $det) {
                $nItem = $i + 1;
                $prod = $det['prod'];
                $imposto = $det['imposto'] ?? [];

                $nfe->tagprod((object)[
                    'item'    => $nItem,
                    'cProd'   => $prod['cProd'] ?? (string)$nItem,
                    'cEAN'    => $prod['cEAN'] ?? 'SEM GTIN',
                    'xProd'   => $prod['xProd'],
                    'NCM'     => $prod['NCM'] ?? '00000000',
                    'CFOP'    => $prod['CFOP'] ?? '5102',
                    'uCom'    => $prod['uCom'] ?? 'UN',
                    'qCom'    => number_format((float)($prod['qCom'] ?? 1), 4, '.', ''),
                    'vUnCom'  => number_format((float)($prod['vUnCom'] ?? 0), 10, '.', ''),
                    'vProd'   => number_format((float)($prod['vProd'] ?? 0), 2, '.', ''),
                    'cEANTrib'=> $prod['cEANTrib'] ?? 'SEM GTIN',
                    'uTrib'   => $prod['uTrib'] ?? ($prod['uCom'] ?? 'UN'),
                    'qTrib'   => number_format((float)($prod['qTrib'] ?? $prod['qCom'] ?? 1), 4, '.', ''),
                    'vUnTrib' => number_format((float)($prod['vUnTrib'] ?? $prod['vUnCom'] ?? 0), 10, '.', ''),
                    'indTot'  => $prod['indTot'] ?? 1,
                ]);

                // ICMS
                $icms = $imposto['ICMS'] ?? [];
                $icmsOrig = $icms['orig'] ?? 0;
                $icmsCST  = $icms['CST'] ?? null;
                $icmsCSOSN = $icms['CSOSN'] ?? null;

                if ($icmsCSOSN) {
                    // Simples Nacional
                    $nfe->tagICMSSN((object)[
                        'item'   => $nItem,
                        'orig'   => $icmsOrig,
                        'CSOSN'  => $icmsCSOSN,
                        'vBC'    => $icms['vBC'] ?? '0.00',
                        'pICMS'  => $icms['pICMS'] ?? '0.00',
                        'vICMS'  => $icms['vICMS'] ?? '0.00',
                    ]);
                } else {
                    $nfe->tagICMS((object)[
                        'item'   => $nItem,
                        'orig'   => $icmsOrig,
                        'CST'    => $icmsCST ?? '00',
                        'modBC'  => $icms['modBC'] ?? 0,
                        'vBC'    => $icms['vBC'] ?? '0.00',
                        'pICMS'  => $icms['pICMS'] ?? '0.00',
                        'vICMS'  => $icms['vICMS'] ?? '0.00',
                    ]);
                }

                // PIS
                $pis = $imposto['PIS'] ?? [];
                $nfe->tagPIS((object)[
                    'item'  => $nItem,
                    'CST'   => $pis['CST'] ?? '07',
                    'vBC'   => $pis['vBC'] ?? '0.00',
                    'pPIS'  => $pis['pPIS'] ?? '0.00',
                    'vPIS'  => $pis['vPIS'] ?? '0.00',
                ]);

                // COFINS
                $cofins = $imposto['COFINS'] ?? [];
                $nfe->tagCOFINS((object)[
                    'item'     => $nItem,
                    'CST'      => $cofins['CST'] ?? '07',
                    'vBC'      => $cofins['vBC'] ?? '0.00',
                    'pCOFINS'  => $cofins['pCOFINS'] ?? '0.00',
                    'vCOFINS'  => $cofins['vCOFINS'] ?? '0.00',
                ]);
            }

            // total — ICMSTot
            $icmsTot = $infNFe['total']['ICMSTot'] ?? [];
            $nfe->tagICMSTot((object)[
                'vBC'      => $icmsTot['vBC'] ?? '0.00',
                'vICMS'    => $icmsTot['vICMS'] ?? '0.00',
                'vICMSDeson' => '0.00',
                'vFCP'     => '0.00',
                'vBCST'    => '0.00',
                'vST'      => '0.00',
                'vFCPST'   => '0.00',
                'vFCPSTRet' => '0.00',
                'vProd'    => $icmsTot['vProd'] ?? '0.00',
                'vFrete'   => $icmsTot['vFrete'] ?? '0.00',
                'vSeg'     => '0.00',
                'vDesc'    => $icmsTot['vDesc'] ?? '0.00',
                'vII'      => '0.00',
                'vIPI'     => $icmsTot['vIPI'] ?? '0.00',
                'vIPIDevol' => '0.00',
                'vPIS'     => $icmsTot['vPIS'] ?? '0.00',
                'vCOFINS'  => $icmsTot['vCOFINS'] ?? '0.00',
                'vOutro'   => '0.00',
                'vNF'      => $icmsTot['vNF'] ?? '0.00',
            ]);

            // transp — transport
            $transp = $infNFe['transp'] ?? [];
            $nfe->tagtransp((object)[
                'modFrete' => $transp['modFrete'] ?? 9, // 9=sem frete
            ]);

            // pag — payment
            $pagamentos = $infNFe['pag'] ?? [];
            foreach ($pagamentos as $pag) {
                $nfe->tagdetPag((object)[
                    'indPag' => $pag['indPag'] ?? 0, // 0=à vista
                    'tPag'   => $pag['tPag'] ?? '01',
                    'vPag'   => $pag['vPag'] ?? '0.00',
                ]);
            }

            // infAdic
            $infAdic = $infNFe['infAdic'] ?? [];
            if (!empty($infAdic['infCpl'])) {
                $nfe->taginfAdic((object)[
                    'infCpl' => $infAdic['infCpl'],
                ]);
            }

            // ── 3. Generate unsigned XML ──
            $xmlUnsigned = $nfe->getXML();
            if (empty($xmlUnsigned)) {
                $errors = $nfe->getErrors();
                return [
                    'ok' => false,
                    'error' => 'Falha ao gerar XML: ' . implode('; ', $errors),
                ];
            }

            // ── 4. Configure Tools (certificate + environment) ──
            $pfxContent = base64_decode($payload['certificate_pfx_base64']);
            if (!$pfxContent) {
                return ['ok' => false, 'error' => 'Certificado PFX inválido (base64)'];
            }

            $emitCNPJ = preg_replace('/\D/', '', $emit['CNPJ']);
            $emitUF   = $emit['enderEmit']['UF'] ?? 'SP';

            $config = [
                'atualizacao' => date('Y-m-d H:i:s'),
                'tpAmb'       => $environment,
                'razaosocial' => $emit['xNome'],
                'cnpj'        => $emitCNPJ,
                'siglaUF'     => $emitUF,
                'schemes'     => 'PL_009_V4',
                'versao'      => '4.00',
            ];

            // CSC for NFC-e
            if ($modelo === '65') {
                $config['CSC'] = $payload['csc'];
                $config['CSCid'] = $payload['csc_id'];
            }

            $configJson = json_encode($config);
            $certificate = Certificate::readPfx($pfxContent, $payload['certificate_password']);
            $tools = new Tools($configJson, $certificate);
            $tools->model($modelo);

            // ── 5. Sign the XML ──
            $xmlSigned = $tools->signNFe($xmlUnsigned);

            // ── 6. Send to SEFAZ ──
            $response = $tools->sefazEnviaLote([$xmlSigned], rand(1, 999999999));
            $st = new Standardize($response);
            $stdResponse = $st->toStd();

            // ── 7. Check response ──
            $cStat = $stdResponse->cStat ?? null;

            // Lote recebido: need to query receipt
            if ($cStat == '103') {
                $nRec = $stdResponse->infRec->nRec ?? null;
                if ($nRec) {
                    // Wait a moment then query
                    sleep(3);
                    $retResponse = $tools->sefazConsultaRecibo($nRec);
                    $stRet = new Standardize($retResponse);
                    $stdRet = $stRet->toStd();

                    $protNFe = $stdRet->protNFe ?? null;
                    if ($protNFe) {
                        $infProt = $protNFe->infProt ?? null;
                        if ($infProt && ($infProt->cStat ?? null) == '100') {
                            // Authorized!
                            $chNFe = $infProt->chNFe ?? '';
                            $nProt = $infProt->nProt ?? '';

                            // Add protocol to signed XML
                            $xmlProtocoled = $tools->addProtocoloNFe($xmlSigned, $retResponse);

                            // Archive
                            $this->archiveXml($chNFe, $xmlProtocoled);

                            return [
                                'ok' => true,
                                'access_key' => $chNFe,
                                'protocol' => $nProt,
                                'xml_signed' => base64_encode($xmlProtocoled),
                                'cStat' => '100',
                                'xMotivo' => $infProt->xMotivo ?? 'Autorizado',
                            ];
                        }

                        // Rejected
                        return [
                            'ok' => false,
                            'error' => 'Rejeitada pela SEFAZ',
                            'cStat' => $infProt->cStat ?? null,
                            'xMotivo' => $infProt->xMotivo ?? 'Rejeição sem motivo',
                            'xml_unsigned' => base64_encode($xmlUnsigned),
                        ];
                    }

                    // Could not get protocol
                    return [
                        'ok' => false,
                        'error' => 'Não foi possível obter retorno do recibo',
                        'nRec' => $nRec,
                        'raw_response' => $retResponse,
                    ];
                }
            }

            // Synchronous authorization (some UFs)
            if ($cStat == '100' || $cStat == '104') {
                $protNFe = $stdResponse->protNFe ?? null;
                if ($protNFe) {
                    $infProt = $protNFe->infProt ?? null;
                    if ($infProt && ($infProt->cStat ?? null) == '100') {
                        $chNFe = $infProt->chNFe ?? '';
                        $nProt = $infProt->nProt ?? '';
                        $xmlProtocoled = $tools->addProtocoloNFe($xmlSigned, $response);
                        $this->archiveXml($chNFe, $xmlProtocoled);

                        return [
                            'ok' => true,
                            'access_key' => $chNFe,
                            'protocol' => $nProt,
                            'xml_signed' => base64_encode($xmlProtocoled),
                            'cStat' => '100',
                            'xMotivo' => $infProt->xMotivo ?? 'Autorizado',
                        ];
                    }
                }
            }

            // Other status — rejection or error
            return [
                'ok' => false,
                'error' => 'Resposta não autorizada da SEFAZ',
                'cStat' => $cStat,
                'xMotivo' => $stdResponse->xMotivo ?? 'Motivo não informado',
                'raw_response' => $response,
            ];

        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'error' => 'Erro interno: ' . $e->getMessage(),
                'trace' => getenv('APP_DEBUG') ? $e->getTraceAsString() : null,
            ];
        }
    }

    /**
     * Cancel NF-e/NFC-e.
     *
     * @param array $payload { certificate_pfx_base64, certificate_password, access_key, protocol, justification, environment }
     */
    public function cancel(array $payload): array
    {
        try {
            $required = ['certificate_pfx_base64', 'certificate_password', 'access_key', 'protocol', 'justification'];
            foreach ($required as $field) {
                if (empty($payload[$field])) {
                    return ['ok' => false, 'error' => "Campo obrigatório ausente: {$field}"];
                }
            }

            $justification = $payload['justification'];
            if (mb_strlen($justification) < 15) {
                return ['ok' => false, 'error' => 'Justificativa deve ter pelo menos 15 caracteres'];
            }

            $chNFe = $payload['access_key'];
            $nProt = $payload['protocol'];
            $environment = (int)($payload['environment'] ?? 2);

            // Derive CNPJ and UF from access key
            $cnpj = substr($chNFe, 6, 14);
            $uf = substr($chNFe, 0, 2);

            $config = [
                'atualizacao' => date('Y-m-d H:i:s'),
                'tpAmb'       => $environment,
                'razaosocial' => $payload['emitter_name'] ?? 'RADUL PLATFORM',
                'cnpj'        => $cnpj,
                'siglaUF'     => $this->ufCodeToSigla($uf),
                'schemes'     => 'PL_009_V4',
                'versao'      => '4.00',
            ];

            $pfxContent = base64_decode($payload['certificate_pfx_base64']);
            $certificate = Certificate::readPfx($pfxContent, $payload['certificate_password']);
            $tools = new Tools(json_encode($config), $certificate);

            // Determine model from access key (position 20-21)
            $modelo = substr($chNFe, 20, 2);
            $tools->model($modelo);

            $response = $tools->sefazCancela($chNFe, $justification, $nProt);
            $st = new Standardize($response);
            $std = $st->toStd();

            $retEvento = $std->retEvento ?? null;
            $infEvento = $retEvento->infEvento ?? null;

            if ($infEvento && in_array($infEvento->cStat ?? '', ['135', '155'])) {
                return [
                    'ok' => true,
                    'access_key' => $chNFe,
                    'protocol_cancel' => $infEvento->nProt ?? '',
                    'cStat' => $infEvento->cStat,
                    'xMotivo' => $infEvento->xMotivo ?? 'Cancelado',
                    'xml_cancel' => base64_encode($response),
                ];
            }

            return [
                'ok' => false,
                'error' => 'Cancelamento não autorizado',
                'cStat' => $infEvento->cStat ?? null,
                'xMotivo' => $infEvento->xMotivo ?? 'Motivo não informado',
            ];

        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'error' => 'Erro no cancelamento: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Carta de Correção (CC-e).
     *
     * @param array $payload { certificate_pfx_base64, certificate_password, access_key, correction_text, sequence, environment }
     */
    public function correct(array $payload): array
    {
        try {
            $required = ['certificate_pfx_base64', 'certificate_password', 'access_key', 'correction_text'];
            foreach ($required as $field) {
                if (empty($payload[$field])) {
                    return ['ok' => false, 'error' => "Campo obrigatório ausente: {$field}"];
                }
            }

            $correctionText = $payload['correction_text'];
            if (mb_strlen($correctionText) < 15) {
                return ['ok' => false, 'error' => 'Texto de correção deve ter pelo menos 15 caracteres'];
            }

            $chNFe = $payload['access_key'];
            $seq = (int)($payload['sequence'] ?? 1);
            $environment = (int)($payload['environment'] ?? 2);

            $cnpj = substr($chNFe, 6, 14);
            $uf = substr($chNFe, 0, 2);

            $config = [
                'atualizacao' => date('Y-m-d H:i:s'),
                'tpAmb'       => $environment,
                'razaosocial' => $payload['emitter_name'] ?? 'RADUL PLATFORM',
                'cnpj'        => $cnpj,
                'siglaUF'     => $this->ufCodeToSigla($uf),
                'schemes'     => 'PL_009_V4',
                'versao'      => '4.00',
            ];

            $pfxContent = base64_decode($payload['certificate_pfx_base64']);
            $certificate = Certificate::readPfx($pfxContent, $payload['certificate_password']);
            $tools = new Tools(json_encode($config), $certificate);

            $modelo = substr($chNFe, 20, 2);
            $tools->model($modelo);

            $response = $tools->sefazCartaCorrecao($chNFe, $correctionText, $seq);
            $st = new Standardize($response);
            $std = $st->toStd();

            $retEvento = $std->retEvento ?? null;
            $infEvento = $retEvento->infEvento ?? null;

            if ($infEvento && in_array($infEvento->cStat ?? '', ['135', '155'])) {
                return [
                    'ok' => true,
                    'access_key' => $chNFe,
                    'sequence' => $seq,
                    'cStat' => $infEvento->cStat,
                    'xMotivo' => $infEvento->xMotivo ?? 'Carta de correção registrada',
                    'xml_cce' => base64_encode($response),
                ];
            }

            return [
                'ok' => false,
                'error' => 'Carta de correção não autorizada',
                'cStat' => $infEvento->cStat ?? null,
                'xMotivo' => $infEvento->xMotivo ?? 'Motivo não informado',
            ];

        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'error' => 'Erro na carta de correção: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Check SEFAZ service status.
     *
     * @param string $uf UF code (e.g. '35' for SP)
     * @param string $env '1' production, '2' homologation
     */
    public function statusServico(string $uf, string $env = '2'): array
    {
        try {
            // For status check, we can use a minimal config without certificate
            // But sped-nfe requires a certificate. Use a dummy if none provided.
            // In practice, this endpoint would need a valid cert. For now, return info.
            return [
                'ok' => true,
                'service' => 'fiscal-nfe',
                'uf' => $uf,
                'environment' => $env,
                'message' => 'Use POST /nfe/emit or /nfce/emit to emit documents',
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    // ─── Private helpers ───

    /**
     * Archive XML to storage/xml/{year}/{month}/{chNFe}.xml
     */
    private function archiveXml(string $chNFe, string $xml): void
    {
        $dir = $this->storageDir . '/xml/' . date('Y') . '/' . date('m');
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents("{$dir}/{$chNFe}.xml", $xml);
    }

    /**
     * Convert numeric UF code to 2-letter sigla.
     */
    private function ufCodeToSigla(string $code): string
    {
        $map = [
            '11' => 'RO', '12' => 'AC', '13' => 'AM', '14' => 'RR',
            '15' => 'PA', '16' => 'AP', '17' => 'TO', '21' => 'MA',
            '22' => 'PI', '23' => 'CE', '24' => 'RN', '25' => 'PB',
            '26' => 'PE', '27' => 'AL', '28' => 'SE', '29' => 'BA',
            '31' => 'MG', '32' => 'ES', '33' => 'RJ', '35' => 'SP',
            '41' => 'PR', '42' => 'SC', '43' => 'RS', '50' => 'MS',
            '51' => 'MT', '52' => 'GO', '53' => 'DF',
        ];
        return $map[$code] ?? 'SP';
    }
}
