import { NextResponse } from "next/server";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const jsonError = (status: number, message: string): NextResponse =>
  NextResponse.json(
    {
      error: message
    },
    { status }
  );

export const handleApiError = (error: unknown): NextResponse => {
  if (error instanceof ApiError) {
    return jsonError(error.status, error.message);
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return jsonError(500, message);
};

