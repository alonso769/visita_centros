const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

// TUS CREDENCIALES
const CREDENCIALES = {
    user: 'lnateros',
    pass: '980196684'
};

const delay = (time) => new Promise(resolve => setTimeout(resolve, time));

app.post('/api/buscar-dni', async (req, res) => {
    // Aumentamos el tiempo máximo de la petición a 5 minutos (Render es lento a veces)
    req.setTimeout(300000); 
    
    const { dni } = req.body;
    console.log(`🤖 ROBOT V22 (RENDER): Solicitud para DNI ${dni}...`);

    let browser = null;

    try {
        browser = await puppeteer.launch({ 
            headless: 'new', 
            ignoreHTTPSErrors: true,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Vital para Render (memoria compartida)
                '--disable-accelerated-2d-canvas', // Ahorra recursos gráficos
                '--disable-gpu', // Render no tiene GPU
                '--start-maximized',
                '--single-process' // Ayuda en entornos ligeros
            ]
        });
        
        const pages = await browser.pages();
        const page = pages[0];

        // Configuración de tiempos de espera más largos (60 segundos por defecto)
        page.setDefaultNavigationTimeout(60000);
        page.setDefaultTimeout(60000);

        // DISFRAZ DE HUMANO
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        // 1. LOGIN
        console.log(`[${dni}] Paso 1: Navegando al Login...`);
        
        // Usamos 'domcontentloaded' que es más rápido y falla menos que 'networkidle2'
        await page.goto('https://internoscs.minsa.gob.pe/Seguridad/Login', { 
            waitUntil: 'domcontentloaded'
        });

        // Esperamos explícitamente a que el input exista (hasta 60 seg)
        console.log(`[${dni}] Esperando carga del formulario...`);
        
        // Intentamos cerrar popup si aparece rápido
        try {
            const btnCerrar = await page.waitForSelector('button.btn-danger', { timeout: 5000 });
            if (btnCerrar) {
                await page.evaluate(b => b.click(), btnCerrar);
                console.log("Popup inicial cerrado.");
            }
        } catch (e) {}

        // BUSCAMOS EL INPUT DE USUARIO
        await page.waitForSelector('input[placeholder="Usuario"]', { visible: true });
        
        console.log(`[${dni}] Escribiendo credenciales...`);
        await delay(1000); // Pequeña pausa de seguridad
        await page.type('input[placeholder="Usuario"]', CREDENCIALES.user); 
        await page.type('input[type="password"]', CREDENCIALES.pass);
        await delay(500); 

        // Click Login
        await page.evaluate(() => {
            const btn = document.getElementById('btnVerificarAcceso');
            if (btn) { btn.removeAttribute('disabled'); btn.click(); }
        });
        
        console.log(`[${dni}] Entrando al sistema...`);
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

        // Limpiar Bienvenida
        await delay(1500);
        try {
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('CERRAR'));
                if (btn) btn.click();
            });
        } catch(e) {}

        // 2. NAVEGAR MENU
        console.log(`[${dni}] Paso 2: Buscando opción de menú...`);
        
        // Navegación directa forzada (Más fiable que hacer clic)
        const urlActual = page.url();
        // Si estamos en la home, intentamos ir directo a la URL del proceso si la sabemos,
        // si no, usamos el método de clics pero con más espera.
        
        const menuClick = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const proceso = links.find(x => x.innerText.toUpperCase().includes('PROCESO'));
            if (proceso) { proceso.click(); return true; }
            return false;
        });

        if(menuClick) await delay(1000);

        try {
            await page.waitForSelector('#lnkAsociarInternoAmbito', { timeout: 10000 });
            await page.click('#lnkAsociarInternoAmbito');
        } catch (e) {
            // Fallback JS puro
            await page.evaluate(() => {
                const link = document.getElementById('lnkAsociarInternoAmbito');
                if(link) link.click();
            });
        }
        
        // 3. ESPERAR TABLA
        console.log(`[${dni}] ⏳ Esperando carga de tabla (puede tardar)...`);
        await page.waitForSelector('#divGrillaListadoProcesosInternados', { visible: true });

        await delay(1500);
        
        // Seleccionar primera convocatoria
        const hayLupa = await page.evaluate(() => {
            const img = document.querySelector('#divGrillaListadoProcesosInternados img[title*="Visualizar"]');
            if (img) { img.click(); return true; }
            return false;
        });
        
        if (!hayLupa) {
            await page.click('#divGrillaListadoProcesosInternados table tbody tr:first-child a').catch(() => {});
        }

        // 4. BÚSQUEDA DEL DNI
        console.log(`[${dni}] 🔍 Buscando postulante...`);
        const idDni = '#txtNumeroDocumentoPostulanteRegistrado';
        await page.waitForSelector(idDni, { visible: true });

        // Limpiar y escribir
        await page.evaluate((sel) => { document.querySelector(sel).value = ''; }, idDni);
        await page.type(idDni, dni, { delay: 100 }); // Escribir más lento para que la web lo procese
        await page.keyboard.press('Tab');
        await delay(500);

        // Click Botón Buscar
        await page.evaluate(() => {
            const btn = document.getElementById('btnBuscarInformacionPostulantesInscritos');
            if(btn) btn.click();
        });

        // 5. SELECCIONAR RESULTADO
        await delay(3000); // Espera más larga para resultados en servidor lento

        const resultadoClick = await page.evaluate((dniBuscado) => {
            const filas = Array.from(document.querySelectorAll('#divGrillaListadoProcesosInternados table tbody tr'));
            const fila = filas.find(tr => tr.innerText.includes(dniBuscado));
            
            if (fila) {
                const lupa = fila.querySelector('img[src*="visualizar.png"]');
                if (lupa) {
                    lupa.click();
                    if(lupa.parentElement && lupa.parentElement.tagName === 'A') lupa.parentElement.click();
                    return "OK";
                }
            }
            const todasLupas = document.querySelectorAll('img[src*="visualizar.png"]');
            if(todasLupas.length === 1) {
                todasLupas[0].click();
                return "OK_GENERICO";
            }
            return "NO";
        }, dni);

        if (resultadoClick === "NO") {
            console.log(`[${dni}] ❌ DNI no encontrado.`);
            return res.json({ success: true, found: false });
        }

        // 6. EXTRACCIÓN
        console.log(`[${dni}] 📥 Extrayendo datos...`);
        await page.waitForSelector('#txtNombre', { visible: true, timeout: 30000 });
        await delay(500); 

        const datos = await page.evaluate(() => {
            const val = (id) => {
                const e = document.getElementById(id);
                return e ? (e.value || e.innerText || "").trim() : "";
            };
            return {
                nombres: val('txtNombre'),
                apePat: val('txtApellidoPaternoMantenimiento'), 
                apeMat: val('txtApellidoMaternoMantenimiento'),
                fullText: document.body.innerText 
            };
        });

        const extract = (regex, text) => {
            const m = text.match(regex);
            return m ? m[1].trim() : "-";
        };

        const resultadoFinal = {
            nombres: datos.nombres,
            apePat: datos.apePat,
            apeMat: datos.apeMat,
            universidad: extract(/Universidad de procedencia\s*\n?(.+)/i, datos.fullText),
            carrera: extract(/Escuela Profesional\s*\n?(.+)/i, datos.fullText)
        };

        console.log(`[${dni}] ✅ ÉXITO: ${resultadoFinal.nombres}`);
        res.json({ success: true, found: true, data: resultadoFinal });

    } catch (error) {
        console.error(`[${dni}] ❌ ERROR CRÍTICO:`, error.message);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) {
            console.log(`[${dni}] 🧹 Limpiando navegador...`);
            await browser.close().catch(e => console.error("Error cerrando:", e));
        }
    }
});

app.listen(3001, () => {
    console.log('🤖 ROBOT V22 (RENDER OPTIMIZADO) listo en puerto 3001');
});