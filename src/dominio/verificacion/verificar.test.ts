import { describe, expect, it } from "vitest";
import type { Ficha, LecturaDeDocumento, Liquidacion, Reglas } from "../tipos.js";
import { verificacionQueDecide, verificarRecibo } from "./verificar.js";

const ficha: Ficha = {
  negociacionId: "1",
  nombre: "Persona de Prueba",
  dni: "12345678",
  provincia: "Catamarca",
  convenio: "EMPLEADOS_PUBLICOS_CATAMARCA",
  sectorDeclarado: "publico",
  empleadorDeclarado: "Ministerio de Educación de Catamarca",
};

const reglas: Reglas = {
  diaDeGracia: 10,
  exclusiones: [{ convenio: null, provincia: "catamarca", patron: "bomberos", motivo: "Bomberos no califica en Catamarca" }],
};

const reciboCorrecto: Liquidacion = {
  empleador: "Ministerio de Educación - Gobierno de Catamarca",
  cuil: "20-12345678-6",
  dni: undefined,
  periodo: { anio: 2026, mes: 9 },
  provincia: "Catamarca",
  sector: "publico",
  conHaberes: true,
};

const hoy = new Date(2026, 9, 20);

function documento(liquidaciones: Liquidacion[], cambios: Partial<LecturaDeDocumento> = {}): LecturaDeDocumento {
  return { legible: true, otrosDocumentos: [], liquidaciones, ...cambios };
}

function verificar(cambios: Partial<Liquidacion>, cambiosDeFicha: Partial<Ficha> = {}) {
  return verificarRecibo({ lectura: documento([{ ...reciboCorrecto, ...cambios }]), ficha: { ...ficha, ...cambiosDeFicha }, reglas, hoy });
}

describe("verificarRecibo", () => {
  it("acepta un recibo del mes anterior que coincide con la ficha", () => {
    const resultado = verificar({});
    expect(resultado.decision).toBe("aceptar");
    expect(resultado.chequeos.every((c) => c.ok)).toBe(true);
  });

  it("pide de nuevo cuando el documento no es un recibo, sin evaluar lo demás", () => {
    const resultado = verificarRecibo({ lectura: documento([], { otrosDocumentos: ["dni"] }), ficha, reglas, hoy });
    expect(resultado.decision).toBe("pedir_de_nuevo");
    expect(resultado.chequeos).toHaveLength(1);
    expect(resultado.motivos[0]).toContain("el DNI");
  });

  it("pide el último recibo cuando el período es viejo", () => {
    const resultado = verificar({ periodo: { anio: 2026, mes: 7 } });
    expect(resultado.decision).toBe("pedir_de_nuevo");
    expect(resultado.motivos[0]).toContain("julio 2026");
  });

  it("acepta el recibo de dos meses atrás dentro del día de gracia", () => {
    const resultado = verificarRecibo({ lectura: documento([{ ...reciboCorrecto, periodo: { anio: 2026, mes: 8 } }]), ficha, reglas, hoy: new Date(2026, 9, 5) });
    expect(resultado.decision).toBe("aceptar");
  });

  it("deriva cuando el CUIL es de otra persona", () => {
    const resultado = verificar({ cuil: "27-87654321-9" });
    expect(resultado.decision).toBe("derivar");
  });

  it("pide de nuevo cuando el CUIL se leyó mal: no cierra el verificador y no es el de la ficha", () => {
    expect(verificar({ cuil: "20-12345670-5" }).decision).toBe("pedir_de_nuevo");
  });

  it("deriva cuando el recibo es privado y la ficha declara público", () => {
    expect(verificar({ sector: "privado" }).decision).toBe("derivar");
  });

  it("deriva cuando el empleador está excluido por convenio", () => {
    const resultado = verificar({ empleador: "Cuerpo de Bomberos de la Provincia de Catamarca", provincia: "Catamarca" });
    expect(resultado.decision).toBe("derivar");
    expect(resultado.motivos[0]).toContain("Bomberos");
  });

  it("la exclusión por provincia aplica aunque el convenio venga con la etiqueta de Bitrix", () => {
    const resultado = verificar({ empleador: "Cuerpo de Bomberos de la Provincia de Catamarca", provincia: "Catamarca" }, { convenio: "Amejuca" });
    expect(resultado.decision).toBe("derivar");
  });

  it("acepta un CUIL de DNI de 7 cifras aunque venga sin el cero", () => {
    const resultado = verificar({ cuil: "20-8333444-5" }, { dni: "8333444" });
    expect(resultado.chequeos.find((c) => c.nombre === "identidad")?.ok).toBe(true);
  });

  it("derivar pesa más que pedir de nuevo cuando fallan los dos", () => {
    expect(verificar({ sector: "privado", periodo: undefined }).decision).toBe("derivar");
  });

  describe("archivos que traen más que un recibo", () => {
    it("acepta el recibo aunque venga en el mismo archivo que el DNI y una factura", () => {
      const lectura = documento([reciboCorrecto], { otrosDocumentos: ["dni", "factura_de_servicio"] });
      expect(verificarRecibo({ lectura, ficha, reglas, hoy }).decision).toBe("aceptar");
    });

    it("con varias liquidaciones verifica la del período que se pide, venga en el orden que venga", () => {
      const vieja = { ...reciboCorrecto, periodo: { anio: 2026, mes: 7 } };
      const anterior = { ...reciboCorrecto, periodo: { anio: 2026, mes: 8 } };
      expect(verificarRecibo({ lectura: documento([vieja, reciboCorrecto, anterior]), ficha, reglas, hoy }).decision).toBe("aceptar");
    });

    it("si ninguna liquidación es del período, informa el de la más reciente", () => {
      const junio = { ...reciboCorrecto, periodo: { anio: 2026, mes: 6 } };
      const julio = { ...reciboCorrecto, periodo: { anio: 2026, mes: 7 } };
      const resultado = verificarRecibo({ lectura: documento([junio, julio]), ficha, reglas, hoy });
      expect(resultado.decision).toBe("pedir_de_nuevo");
      expect(resultado.motivos[0]).toContain("julio 2026");
    });

    it("si reconoció otros documentos y ningún recibo, lo dice aunque el lector lo marque ilegible", () => {
      const lectura = documento([], { legible: false, otrosDocumentos: ["dni", "constancia_bancaria"] });
      expect(verificarRecibo({ lectura, ficha, reglas, hoy }).motivos[0]).toContain("el DNI, una constancia bancaria, pero no el recibo");
    });

    it("una foto cortada donde no se ven los haberes se pide de nuevo", () => {
      const resultado = verificar({ conHaberes: false });
      expect(resultado.decision).toBe("pedir_de_nuevo");
      expect(resultado.motivos[0]).toContain("haberes");
    });

    it("un archivo ilegible se pide de nuevo", () => {
      expect(verificarRecibo({ lectura: documento([], { legible: false }), ficha, reglas, hoy }).motivos[0]).toContain("no se lee");
    });
  });

  describe("identidad", () => {
    it("si el número del CUIL es el de la ficha, vale aunque el verificador se haya leído mal", () => {
      expect(verificar({ cuil: "20-12345678-0" }).decision).toBe("aceptar");
    });

    it("reconoce el CUIL aunque venga sin guiones en el lugar del DNI", () => {
      expect(verificar({ cuil: undefined, dni: "20123456786" }).decision).toBe("aceptar");
    });

    it("sin CUIL en el recibo, vale el DNI impreso si es el de la ficha", () => {
      expect(verificar({ cuil: undefined, dni: "12.345.678" }).decision).toBe("aceptar");
    });

    it("sin CUIL y con el DNI de otra persona, deriva", () => {
      expect(verificar({ cuil: undefined, dni: "87.654.321" }).decision).toBe("derivar");
    });

    it("un DNI que difiere en un dígito es una mala lectura, no otra persona: pide de nuevo", () => {
      const resultado = verificar({ cuil: undefined, dni: "12.345.878" });
      expect(resultado.decision).toBe("pedir_de_nuevo");
      expect(resultado.motivos[0]).toContain("no se lee bien");
    });

    it("sin CUIL ni DNI en el recibo, pide de nuevo", () => {
      expect(verificar({ cuil: undefined }).decision).toBe("pedir_de_nuevo");
    });

    it("si la ficha no tiene documento contra el cual comparar, deriva en vez de aceptar a ciegas", () => {
      expect(verificar({}, { dni: "" }).decision).toBe("derivar");
    });
  });

  describe("empleador", () => {
    it("si la ficha no declara empleador, alcanza con que coincidan sector y provincia", () => {
      const { empleadorDeclarado: _sinDeclarar, ...fichaSinEmpleador } = ficha;
      const lectura = documento([{ ...reciboCorrecto, empleador: "Dirección de Rentas" }]);
      expect(verificarRecibo({ lectura, ficha: fichaSinEmpleador, reglas, hoy }).decision).toBe("aceptar");
    });

    it("si la ficha declara empleador y el del recibo es otro, deriva", () => {
      expect(verificar({ empleador: "Dirección de Rentas" }).decision).toBe("derivar");
    });

    it("deriva cuando el recibo es de otra provincia", () => {
      expect(verificar({ provincia: "Tucumán" }).decision).toBe("derivar");
    });

    it("no compara la provincia cuando el recibo no la trae", () => {
      expect(verificar({ provincia: undefined }).decision).toBe("aceptar");
    });
  });
});

describe("verificacionQueDecide", () => {
  const revisado = (lectura: LecturaDeDocumento) => ({ verificacion: verificarRecibo({ lectura, ficha, reglas, hoy }) });
  const dniSuelto = revisado(documento([], { otrosDocumentos: ["dni"] }));
  const reciboViejo = revisado(documento([{ ...reciboCorrecto, periodo: { anio: 2026, mes: 6 } }]));
  const reciboAjeno = revisado(documento([{ ...reciboCorrecto, cuil: "27-87654321-9" }]));
  const reciboBueno = revisado(documento([reciboCorrecto]));

  it("vale el archivo que sirve aunque los otros no sean recibos", () => {
    expect(verificacionQueDecide([dniSuelto, reciboBueno])?.verificacion.decision).toBe("aceptar");
  });

  it("un recibo viejo pesa más que un DNI suelto: el motivo habla del recibo", () => {
    expect(verificacionQueDecide([reciboViejo, dniSuelto])?.verificacion.motivos[0]).toContain("junio 2026");
  });

  it("una discrepancia pesa más que un archivo que no sirve", () => {
    expect(verificacionQueDecide([dniSuelto, reciboAjeno, reciboViejo])?.verificacion.decision).toBe("derivar");
  });
});
