import { Request } from "express";

export type OwnerRequest = Request & { ownerId: string; sessionHash: string };
