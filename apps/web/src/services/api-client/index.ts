export interface ApiClient {
  readonly kind: "http";
}

export const apiClientScaffold: ApiClient = {
  kind: "http",
};
