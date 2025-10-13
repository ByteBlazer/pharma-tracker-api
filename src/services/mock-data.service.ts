import { Injectable } from "@nestjs/common";

@Injectable()
export class MockDataService {
  private mockDocs: any[] = [];

  addMockDoc(doc: any) {
    this.mockDocs.push(doc);
  }

  addMockDocs(docs: any[]) {
    this.mockDocs.push(...docs);
  }

  getMockDocs() {
    return this.mockDocs;
  }

  clearMockDocs() {
    this.mockDocs = [];
  }
}
