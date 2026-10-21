export const PAY_CURRENCIES = [
  ["ARS", "Peso argentino"], ["BOB", "Boliviano"], ["BRL", "Real brasileño"],
  ["BZD", "Dólar beliceño"], ["CLP", "Peso chileno"], ["COP", "Peso colombiano"],
  ["CRC", "Colón costarricense"], ["CUP", "Peso cubano"], ["DOP", "Peso dominicano"],
  ["GTQ", "Quetzal guatemalteco"], ["GYD", "Dólar guyanés"], ["HNL", "Lempira hondureño"],
  ["HTG", "Gourde haitiano"], ["JMD", "Dólar jamaiquino"], ["MXN", "Peso mexicano"],
  ["NIO", "Córdoba nicaragüense"], ["PAB", "Balboa panameño"], ["PEN", "Sol peruano"],
  ["PYG", "Guaraní paraguayo"], ["SRD", "Dólar surinamés"],
  ["TTD", "Dólar trinitense"], ["USD", "Dólar estadounidense"], ["UYU", "Peso uruguayo"],
  ["VES", "Bolívar venezolano"],
].map(([code, name]) => ({ code, name }));

export const PAY_CURRENCY_CODES = PAY_CURRENCIES.map(({ code }) => code);
export const PAY_CURRENCIES_WITHOUT_DECIMALS = ["CLP", "PYG"];
