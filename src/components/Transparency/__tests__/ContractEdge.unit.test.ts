import { ContractEdge, getEdge, getEdges } from "../ContractEdge";

const baseEdgeProps = {
  labelBgPadding: [10, 4],
  labelBgBorderRadius: 4,
};

describe("ContractEdge", () => {
  describe("getEdge", () => {
    it("should display a basic edge", () => {
      const contractEdge: ContractEdge = {
        source: "0x0",
        target: "0x1",
      };

      expect(getEdge(contractEdge)).toEqual({
        id: "0x0-0x1",
        source: "0x0",
        target: "0x1",
        ...baseEdgeProps,
      });
    });

    it("should animate", () => {
      const contractEdge: ContractEdge = {
        source: "0x0",
        target: "0x1",
        animated: true,
      };

      expect(getEdge(contractEdge)).toEqual({
        id: "0x0-0x1",
        source: "0x0",
        target: "0x1",
        animated: true,
        ...baseEdgeProps,
      });
    });
    it("should display a basic edge with a specified type", () => {
      const contractEdge: ContractEdge = {
        source: "0x0",
        target: "0x1",
        type: "step",
      };

      expect(getEdge(contractEdge)).toEqual({
        id: "0x0-0x1",
        source: "0x0",
        target: "0x1",
        type: "step",
        ...baseEdgeProps,
      });
    });

    it("should display a basic edge with a specified label", () => {
      const contractEdge: ContractEdge = {
        source: "0x0",
        target: "0x1",
        label: "yay",
      };

      expect(getEdge(contractEdge)).toEqual({
        id: "0x0-0x1",
        source: "0x0",
        target: "0x1",
        label: "yay",
        ...baseEdgeProps,
      });
    });

    it("should support a specified background color style", () => {
      const contractEdge: ContractEdge = {
        source: "0x0",
        target: "0x1",
        style: { backgroundColor: "yellow" },
      };

      expect(getEdge(contractEdge)).toEqual({
        id: "0x0-0x1",
        source: "0x0",
        target: "0x1",
        style: {
          backgroundColor: "yellow",
        },
        ...baseEdgeProps,
      });
    });

    it("should support a specified color style", () => {
      const contractEdge: ContractEdge = {
        source: "0x0",
        target: "0x1",
        style: { color: "yellow" },
      };

      expect(getEdge(contractEdge)).toEqual({
        id: "0x0-0x1",
        source: "0x0",
        target: "0x1",
        style: {
          color: "yellow",
        },
        ...baseEdgeProps,
      });
    });
  });

  describe("getEdges", () => {
    it("should return edges", () => {
      const contractEdge: ContractEdge = {
        source: "0x0",
        target: "0x1",
      };

      expect(getEdges([contractEdge])).toEqual([
        {
          id: "0x0-0x1",
          source: "0x0",
          target: "0x1",
          ...baseEdgeProps,
        },
      ]);
    });
  });
});
