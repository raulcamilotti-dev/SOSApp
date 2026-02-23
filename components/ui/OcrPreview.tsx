/**
 * OcrPreview — reusable card that shows OCR results for a document.
 * Displays extracted text, confidence, and structured data (CPF, CNPJ, dates, currency).
 */

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    extractCnpj,
    extractCpf,
    extractCurrency,
    extractDates,
    recognizeText,
    type OcrResult,
} from "@/services/tesseract-ocr";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, TouchableOpacity, View } from "react-native";

interface OcrPreviewProps {
  /** Image URI, URL, or base64 to OCR */
  imageSource: string;
  /** Auto-run OCR on mount? Default false (user clicks "Analisar") */
  autoRun?: boolean;
  /** Language for Tesseract. Default "por" */
  lang?: string;
  /** Called when OCR completes */
  onResult?: (
    result: OcrResult & {
      cpfs: string[];
      cnpjs: string[];
      dates: string[];
      currency: string[];
    },
  ) => void;
  /** Called on error */
  onError?: (error: string) => void;
}

export function OcrPreview({
  imageSource,
  lang = "por",
  onResult,
  onError,
}: OcrPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [extractions, setExtractions] = useState<{
    cpfs: string[];
    cnpjs: string[];
    dates: string[];
    currency: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardColor = useThemeColor({}, "card");

  const runOcr = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ocrResult = await recognizeText(imageSource, lang);

      const cpfs = extractCpf(ocrResult.text);
      const cnpjs = extractCnpj(ocrResult.text);
      const dates = extractDates(ocrResult.text);
      const currency = extractCurrency(ocrResult.text);

      setResult(ocrResult);
      setExtractions({ cpfs, cnpjs, dates, currency });

      onResult?.({ ...ocrResult, cpfs, cnpjs, dates, currency });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao processar OCR";
      setError(msg);
      onError?.(msg);
      Alert.alert("Erro OCR", msg);
    } finally {
      setLoading(false);
    }
  }, [imageSource, lang, onResult, onError]);

  const hasExtractions =
    extractions &&
    (extractions.cpfs.length > 0 ||
      extractions.cnpjs.length > 0 ||
      extractions.dates.length > 0 ||
      extractions.currency.length > 0);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor,
        borderRadius: 8,
        padding: 12,
        backgroundColor: cardColor,
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <ThemedText
          style={{ fontSize: 13, fontWeight: "700", color: textColor }}
        >
          Análise OCR
        </ThemedText>
        {result ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor:
                result.confidence > 70 ? "#22c55e20" : "#f59e0b20",
            }}
          >
            <ThemedText
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: result.confidence > 70 ? "#22c55e" : "#f59e0b",
              }}
            >
              {result.confidence.toFixed(0)}% confiança
            </ThemedText>
          </View>
        ) : null}
      </View>

      {!result && !loading ? (
        <TouchableOpacity
          onPress={runOcr}
          style={{
            paddingVertical: 8,
            backgroundColor: tintColor,
            borderRadius: 6,
            alignItems: "center",
          }}
        >
          <ThemedText
            style={{ color: "white", fontWeight: "700", fontSize: 12 }}
          >
            Analisar documento
          </ThemedText>
        </TouchableOpacity>
      ) : null}

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 12 }}>
          <ActivityIndicator size="small" color={tintColor} />
          <ThemedText style={{ fontSize: 11, color: mutedColor, marginTop: 6 }}>
            Processando OCR...
          </ThemedText>
        </View>
      ) : null}

      {error ? (
        <ThemedText style={{ fontSize: 12, color: "#ef4444" }}>
          {error}
        </ThemedText>
      ) : null}

      {result ? (
        <View style={{ gap: 8 }}>
          {result.text ? (
            <View>
              <ThemedText
                style={{ fontSize: 11, fontWeight: "600", color: mutedColor }}
              >
                Texto extraído:
              </ThemedText>
              <ThemedText
                style={{ fontSize: 11, color: textColor, marginTop: 4 }}
                numberOfLines={8}
              >
                {result.text.slice(0, 500)}
                {result.text.length > 500 ? "..." : ""}
              </ThemedText>
            </View>
          ) : null}

          {hasExtractions ? (
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: borderColor,
                paddingTop: 8,
                gap: 6,
              }}
            >
              <ThemedText
                style={{ fontSize: 11, fontWeight: "600", color: mutedColor }}
              >
                Dados detectados:
              </ThemedText>
              {extractions.cpfs.length > 0 ? (
                <ThemedText style={{ fontSize: 11, color: textColor }}>
                  CPF: {extractions.cpfs.join(", ")}
                </ThemedText>
              ) : null}
              {extractions.cnpjs.length > 0 ? (
                <ThemedText style={{ fontSize: 11, color: textColor }}>
                  CNPJ: {extractions.cnpjs.join(", ")}
                </ThemedText>
              ) : null}
              {extractions.dates.length > 0 ? (
                <ThemedText style={{ fontSize: 11, color: textColor }}>
                  Datas: {extractions.dates.join(", ")}
                </ThemedText>
              ) : null}
              {extractions.currency.length > 0 ? (
                <ThemedText style={{ fontSize: 11, color: textColor }}>
                  Valores: {extractions.currency.join(", ")}
                </ThemedText>
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity
            onPress={runOcr}
            style={{ alignSelf: "flex-start", marginTop: 4 }}
          >
            <ThemedText
              style={{ fontSize: 11, color: tintColor, fontWeight: "600" }}
            >
              Analisar novamente
            </ThemedText>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
