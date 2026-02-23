/**
 * Unit tests for brasil-api.ts utility functions.
 *
 * Run with: npx jest __tests__/brasil-api.test.ts
 */

import {
    formatCep,
    formatCnpj,
    formatCpf,
    validateCnpj,
    validateCpf,
} from "../services/brasil-api";

/* ------------------------------------------------------------------ */
/*  CPF Validation                                                     */
/* ------------------------------------------------------------------ */

describe("validateCpf", () => {
  it("accepts a valid CPF (digits only)", () => {
    expect(validateCpf("52998224725")).toBe(true);
  });

  it("accepts a valid CPF with formatting", () => {
    expect(validateCpf("529.982.247-25")).toBe(true);
  });

  it("rejects all same digits", () => {
    expect(validateCpf("00000000000")).toBe(false);
    expect(validateCpf("11111111111")).toBe(false);
    expect(validateCpf("99999999999")).toBe(false);
  });

  it("rejects a CPF with wrong check digits", () => {
    expect(validateCpf("52998224700")).toBe(false);
    expect(validateCpf("12345678901")).toBe(false);
  });

  it("rejects strings that are too short or too long", () => {
    expect(validateCpf("1234")).toBe(false);
    expect(validateCpf("")).toBe(false);
    expect(validateCpf("123456789012")).toBe(false);
  });

  it("accepts another known valid CPF", () => {
    // 453.178.287-91 is a valid CPF
    expect(validateCpf("45317828791")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  CNPJ Validation                                                    */
/* ------------------------------------------------------------------ */

describe("validateCnpj", () => {
  it("accepts a valid CNPJ (digits only)", () => {
    expect(validateCnpj("11222333000181")).toBe(true);
  });

  it("accepts a valid CNPJ with formatting", () => {
    expect(validateCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("rejects all same digits", () => {
    expect(validateCnpj("00000000000000")).toBe(false);
    expect(validateCnpj("11111111111111")).toBe(false);
  });

  it("rejects a CNPJ with wrong check digits", () => {
    expect(validateCnpj("11222333000100")).toBe(false);
  });

  it("rejects strings that are too short", () => {
    expect(validateCnpj("123")).toBe(false);
    expect(validateCnpj("")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */

describe("formatCpf", () => {
  it("formats 11-digit string correctly", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });

  it("returns input unchanged if not 11 digits", () => {
    expect(formatCpf("1234")).toBe("1234");
    expect(formatCpf("")).toBe("");
  });

  it("strips non-digits before formatting", () => {
    expect(formatCpf("529.982.247-25")).toBe("529.982.247-25");
  });
});

describe("formatCnpj", () => {
  it("formats 14-digit string correctly", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("returns input unchanged if not 14 digits", () => {
    expect(formatCnpj("123")).toBe("123");
  });
});

describe("formatCep", () => {
  it("formats 8-digit CEP correctly", () => {
    expect(formatCep("01310100")).toBe("01310-100");
  });

  it("returns input unchanged if not 8 digits", () => {
    expect(formatCep("123")).toBe("123");
    expect(formatCep("")).toBe("");
  });

  it("strips non-digits before formatting", () => {
    expect(formatCep("01310-100")).toBe("01310-100");
  });
});
