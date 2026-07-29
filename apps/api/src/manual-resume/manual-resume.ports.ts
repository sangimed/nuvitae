export interface ManualResumeClock {
  now(): Date;
}

export interface ManualResumeIdGenerator {
  nextId(): string;
}

export interface ManualResumeRequestIdGenerator {
  nextRequestId(): string;
}
