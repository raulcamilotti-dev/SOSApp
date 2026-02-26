/**
 * GuidedTourOverlay — Floating overlay that appears during the guided tour.
 *
 * Renders a semi-transparent backdrop + a bottom sheet with:
 * - Group label + icon
 * - Step title + description + tip
 * - Progress bar
 * - Navigation controls (Anterior / Próximo / Pular)
 *
 * Also renders a "read-only" badge at the top when tour is active.
 */

import { useGuidedTour } from "@/core/context/GuidedTourContext";
import {
    TOUR_STEPS,
    getGroupColor,
    getTourGroups,
} from "@/core/tour/tour-steps";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import {
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function GuidedTourOverlay() {
  const {
    isActive,
    currentStep,
    stepIndex,
    totalSteps,
    progress,
    next,
    prev,
    stop,
    goToStep,
    markCompleted,
  } = useGuidedTour();

  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");

  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= 768;

  const [showStepList, setShowStepList] = useState(false);

  const groups = useMemo(() => getTourGroups(), []);

  const handleNext = useCallback(() => {
    if (stepIndex >= totalSteps - 1) {
      // Last step — finish tour
      markCompleted();
      stop();
    } else {
      next();
    }
  }, [stepIndex, totalSteps, next, stop, markCompleted]);

  const handleSkip = useCallback(() => {
    markCompleted();
    stop();
  }, [markCompleted, stop]);

  if (!isActive || !currentStep) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex >= totalSteps - 1;
  const groupColor = currentStep.groupColor;
  const stepNumber = stepIndex + 1;

  return (
    <>
      {/* ═══ Read-only badge (top of screen) ═══ */}
      <View style={[s.readOnlyBadge, { backgroundColor: groupColor }]}>
        <Ionicons name="eye-outline" size={14} color="#fff" />
        <Text style={s.readOnlyText}>Tour Guiado — Modo Visualização</Text>
        <TouchableOpacity
          onPress={handleSkip}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ═══ Bottom overlay card ═══ */}
      <View
        style={[s.overlay, isDesktop ? s.overlayDesktop : s.overlayMobile]}
        pointerEvents="box-none"
      >
        <View
          style={[
            s.card,
            {
              backgroundColor: cardBg,
              borderColor,
              ...(isDesktop
                ? { maxWidth: 480, alignSelf: "center" as const }
                : {}),
            },
          ]}
        >
          {/* Group label + step counter */}
          <View style={s.topRow}>
            <View
              style={[s.groupBadge, { backgroundColor: groupColor + "1A" }]}
            >
              <Ionicons
                name={currentStep.icon as any}
                size={14}
                color={groupColor}
              />
              <Text style={[s.groupLabel, { color: groupColor }]}>
                {currentStep.group}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowStepList(true)}
              style={s.stepCounter}
            >
              <Text style={[s.stepCounterText, { color: mutedColor }]}>
                {stepNumber} de {totalSteps}
              </Text>
              <Ionicons name="list-outline" size={14} color={mutedColor} />
            </TouchableOpacity>
          </View>

          {/* Progress bar */}
          <View style={[s.progressTrack, { backgroundColor: borderColor }]}>
            <View
              style={[
                s.progressFill,
                {
                  width: `${progress * 100}%` as any,
                  backgroundColor: groupColor,
                },
              ]}
            />
          </View>

          {/* Title */}
          <Text style={[s.title, { color: textColor }]}>
            {currentStep.isHighlight ? "⭐ " : ""}
            {currentStep.title}
          </Text>

          {/* Description */}
          <Text style={[s.description, { color: mutedColor }]}>
            {currentStep.description}
          </Text>

          {/* Tip */}
          {currentStep.tip ? (
            <View
              style={[
                s.tipBox,
                {
                  backgroundColor: groupColor + "0D",
                  borderColor: groupColor + "33",
                },
              ]}
            >
              <Ionicons
                name="bulb-outline"
                size={14}
                color={groupColor}
                style={{ marginTop: 1 }}
              />
              <Text style={[s.tipText, { color: groupColor }]}>
                {currentStep.tip}
              </Text>
            </View>
          ) : null}

          {/* Navigation buttons */}
          <View style={s.navRow}>
            {/* Previous */}
            <TouchableOpacity
              onPress={prev}
              disabled={isFirst}
              style={[
                s.navBtn,
                s.navBtnSecondary,
                {
                  borderColor,
                  opacity: isFirst ? 0.4 : 1,
                },
              ]}
            >
              <Ionicons name="chevron-back" size={16} color={textColor} />
              <Text style={[s.navBtnText, { color: textColor }]}>Anterior</Text>
            </TouchableOpacity>

            {/* Skip */}
            <TouchableOpacity onPress={handleSkip}>
              <Text style={[s.skipText, { color: mutedColor }]}>Pular</Text>
            </TouchableOpacity>

            {/* Next / Finish */}
            <TouchableOpacity
              onPress={handleNext}
              style={[
                s.navBtn,
                s.navBtnPrimary,
                { backgroundColor: groupColor },
              ]}
            >
              <Text style={s.navBtnPrimaryText}>
                {isLast ? "Concluir" : "Próximo"}
              </Text>
              <Ionicons
                name={isLast ? "checkmark" : "chevron-forward"}
                size={16}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ═══ Step list modal ═══ */}
      <Modal
        visible={showStepList}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowStepList(false)}
      >
        <View style={s.modalOverlay}>
          <View
            style={[
              s.stepListSheet,
              {
                backgroundColor: cardBg,
                maxWidth: isDesktop ? 500 : undefined,
                alignSelf: isDesktop ? ("center" as const) : undefined,
              },
            ]}
          >
            {/* Header */}
            <View
              style={[s.stepListHeader, { borderBottomColor: borderColor }]}
            >
              <Text style={[s.stepListTitle, { color: textColor }]}>
                Etapas do Tour
              </Text>
              <TouchableOpacity onPress={() => setShowStepList(false)}>
                <Ionicons name="close" size={22} color={mutedColor} />
              </TouchableOpacity>
            </View>

            {/* Scrollable step list, grouped */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              {groups.map((group) => {
                const gColor = getGroupColor(group);
                const steps = TOUR_STEPS.filter(
                  (st: any) => st.group === group,
                );
                return (
                  <View key={group}>
                    {/* Group header */}
                    <View
                      style={[
                        s.groupHeader,
                        { borderBottomColor: borderColor },
                      ]}
                    >
                      <View style={[s.groupDot, { backgroundColor: gColor }]} />
                      <Text style={[s.groupHeaderText, { color: textColor }]}>
                        {group}
                      </Text>
                    </View>

                    {/* Steps */}
                    {steps.map((step: any) => {
                      const idx = TOUR_STEPS.indexOf(step);
                      const isCurrent = idx === stepIndex;
                      const isPast = idx < stepIndex;

                      return (
                        <TouchableOpacity
                          key={step.id}
                          style={[
                            s.stepListItem,
                            {
                              borderLeftColor: isCurrent
                                ? gColor
                                : "transparent",
                              backgroundColor: isCurrent
                                ? gColor + "0D"
                                : "transparent",
                            },
                          ]}
                          onPress={() => {
                            goToStep(idx);
                            setShowStepList(false);
                          }}
                        >
                          <View style={s.stepListRow}>
                            {isPast ? (
                              <Ionicons
                                name="checkmark-circle"
                                size={16}
                                color={gColor}
                              />
                            ) : (
                              <Ionicons
                                name={step.icon as any}
                                size={16}
                                color={isCurrent ? gColor : mutedColor}
                              />
                            )}
                            <Text
                              style={[
                                s.stepListItemText,
                                {
                                  color: isCurrent
                                    ? textColor
                                    : isPast
                                      ? mutedColor
                                      : textColor,
                                  fontWeight: isCurrent ? "700" : "400",
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {step.title}
                            </Text>
                            {step.isHighlight && (
                              <Text style={{ fontSize: 10 }}>⭐</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  /* Read-only badge at top */
  readOnlyBadge: {
    position: "absolute",
    top: Platform.OS === "ios" ? 52 : 4,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    zIndex: 9999,
    elevation: 10,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 6,
        }),
  },
  readOnlyText: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },

  /* Bottom overlay */
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    elevation: 9,
  },
  overlayMobile: {
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
  },
  overlayDesktop: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: "center",
  },

  /* Main card */
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    width: "100%",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 8,
        }),
  },

  /* Top row: group badge + step counter */
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  groupBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  stepCounter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stepCounterText: {
    fontSize: 12,
    fontWeight: "500",
  },

  /* Progress bar */
  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginBottom: 12,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },

  /* Content */
  title: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
    lineHeight: 22,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },

  /* Tip box */
  tipBox: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },

  /* Navigation row */
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    gap: 8,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  navBtnSecondary: {
    borderWidth: 1,
  },
  navBtnPrimary: {
    // backgroundColor set inline
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  navBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  skipText: {
    fontSize: 12,
    fontWeight: "500",
    textDecorationLine: "underline",
  },

  /* Step list modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  stepListSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    width: "100%",
  },
  stepListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  stepListTitle: {
    fontSize: 17,
    fontWeight: "700",
  },

  /* Group headers in step list */
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  /* Individual step in list */
  stepListItem: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderLeftWidth: 3,
  },
  stepListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepListItemText: {
    flex: 1,
    fontSize: 14,
  },
});
