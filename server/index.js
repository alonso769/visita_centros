const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

const CREDENCIALES = {
    user: 'lnateros',
    pass: '980196684'
};

const delay = (time) => new Promise(resolve => setTimeout(resolve, time));

app.post('/api/buscar-dni', async (req, res) => {
    // Damos 5 minutos máximo a toda la operación
    req.setTimeout(300000); 
    
    const { dni } = req.body;
    console.log(`🤖 ROBOT V23: Solicitud para DNI ${dni}...`);

    let browser = null;

    try {
        browser = await puppeteer.launch({ 
            headless: 'new', 
            ignoreHTTPSErrors: true,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--start-maximized',
                '--single-process',
                '--window-size=1920,1080',
                // Este User-Agent es clave para parecer una PC normal
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ]
        });
        
        const pages = await browser.pages();
        const page = pages[0];

        // Aumentamos la paciencia del robot a 90 segundos
        page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(90000);

        // 1. NAVEGACIÓN
        console.log(`[${dni}] Navegando al Login...`);
        
        try {
            await page.goto('https://internoscs.minsa.gob.pe/Seguridad/Login', { 
                waitUntil: 'domcontentloaded'
            });
        } catch (err) {
            console.log("⚠️ Alerta: La carga inicial tardó, pero intentaremos seguir.");
        }

        // --- DIAGNÓSTICO IMPORTANTE ---
        // Esto nos dirá en los logs qué página cargó realmente
        const titulo = await page.title();
        console.log(`[${dni}] Título de la página cargada: "${titulo}"`);
        // -----------------------------

        // Intento de saltar error de certificado si aparece (típico en servidores)
        if (titulo.includes('Privacy') || titulo.includes('Privacidad') || titulo.includes('Error')) {
             console.log("⚠️ Detectada pantalla de seguridad, intentando saltar...");
             // Truco para saltar advertencia de Chrome
             await page.keyboard.press('Tab');
             await page.keyboard.press('Tab');
             await page.keyboard.press('Enter');
             await delay(3000);
        }

        console.log(`[${dni}] Buscando casilla de usuario...`);
        // Esperamos el selector SIN la opción 'visible' primero para ver si existe en el HTML
        try {
            await page.waitForSelector('input[placeholder="Usuario"]', { timeout: 60000 });
        } catch (e) {
            console.log(`[${dni}] ❌ ERROR: No se encontró la casilla. Posible bloqueo de IP.`);
            throw new Error(`La página cargó con título: "${titulo}", pero no el formulario.`);
        }
        
        console.log(`[${dni}] Escribiendo credenciales...`);
        await delay(1000);
        await page.type('input[placeholder="Usuario"]', CREDENCIALES.user); 
        await page.type('input[type="password"]', CREDENCIALES.pass);
        await delay(500); 

        // Click Login
        await page.evaluate(() => {
            const btn = document.getElementById('btnVerificarAcceso');
            if (btn) { btn.removeAttribute('disabled'); btn.click(); }
        });
        
        console.log(`[${dni}] Entrando al sistema...`);
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => console.log("Navegación continuada..."));

        // Limpiar Bienvenida
        await delay(2000);
        try {
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('CERRAR'));
                if (btn) btn.click();
            });
        } catch(e) {}

        // 2. NAVEGAR MENU
        console.log(`[${dni}] Buscando menú...`);
        
        // Verificamos si seguimos en el login por error
        const urlActual = page.url();
        if (urlActual.includes('Login')) {
             throw new Error("No se pudo iniciar sesión. Seguimos en la página de Login.");
        }

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
            await page.evaluate(() => {
                const link = document.getElementById('lnkAsociarInternoAmbito');
                if(link) link.click();
            });
        }
        
        // 3. ESPERAR TABLA
        console.log(`[${dni}] Esperando tabla...`);
        await page.waitForSelector('#divGrillaListadoProcesosInternados', { visible: true });

        await delay(2000);
        
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
        console.log(`[${dni}] Buscando DNI...`);
        const idDni = '#txtNumeroDocumentoPostulanteRegistrado';
        await page.waitForSelector(idDni, { visible: true });

        await page.evaluate((sel) => { document.querySelector(sel).value = ''; }, idDni);
        await page.type(idDni, dni, { delay: 100 });
        await page.keyboard.press('Tab');
        await delay(500);

        await page.evaluate(() => {
            const btn = document.getElementById('btnBuscarInformacionPostulantesInscritos');
            if(btn) btn.click();
        });

        await delay(3000);

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
            // Intento genérico
            const todasLupas = document.querySelectorAll('img[src*="visualizar.png"]');
            if(todasLupas.length === 1) {
                todasLupas[0].click();
                return "OK_GENERICO";
            }
            return "NO";
        }, dni);

        if (resultadoClick === "NO") {
            console.log(`[${dni}] No encontrado en lista.`);
            return res.json({ success: true, found: false });
        }

        // 6. EXTRACCIÓN
        console.log(`[${dni}] Extrayendo datos...`);
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

        console.log(`[${dni}] ✅ ÉXITO`);
        res.json({ success: true, found: true, data: resultadoFinal });

    } catch (error) {
        console.error(`[${dni}] ❌ ERROR:`, error.message);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close().catch(()=>{});
    }
});

app.listen(3001, () => {
    console.log('🤖 ROBOT V23 (DIAGNÓSTICO) listo en puerto 3001');
});