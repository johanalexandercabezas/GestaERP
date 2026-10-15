export interface LegalAcceptanceStatus {
  terms_version: string;
  privacy_notice_version: string;
  terms_accepted: boolean;
  privacy_notice_acknowledged: boolean;
  terms_accepted_at: string | null;
  privacy_notice_acknowledged_at: string | null;
}
