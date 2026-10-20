// structuredClone exists in every runtime the engine targets (Node 17+ and modern browsers),
// but it is defined in the DOM and Node type libraries, which the engine does not load.
declare function structuredClone<T>(value: T): T
