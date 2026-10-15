export type PersonalDataSubject = "customer" | "supplier" | "employee";
export type ProcessingBasis =
  | "authorization"
  | "legal_exception"
  | "not_personal_data";

export interface ProcessingBasisInput {
  basis: ProcessingBasis | "";
  basisDetail: string;
  purpose: string;
  effectiveDate: string;
  evidenceMethod: string;
  evidenceReference: string;
}

export interface ProcessingBasisRecord extends ProcessingBasisInput {
  recordedAt: string;
  recordedByName: string;
}

export function emptyProcessingBasis(): ProcessingBasisInput {
  return {
    basis: "",
    basisDetail: "",
    purpose: "",
    effectiveDate: "",
    evidenceMethod: "",
    evidenceReference: "",
  };
}
