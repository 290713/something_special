/* ==========================================================================
   НАСТРОЙКИ ПРИЛОЖЕНИЯ ЗАПИСИ
   Это единственный файл, который нужно править. Меняйте текст между кавычками,
   цены (числа) и длительность в минутах (durationMin).
   После правки сохраните файл и обновите страницу в браузере.
   ========================================================================== */

const CONFIG = {
  /* ---- 1. Куда отправлять заявки -------------------------------------------
     Сюда вставьте адрес веб-приложения Google Apps Script (см. README.md).
     Пока строка пустая, заявка открывает готовое письмо в вашей почте
     и скачивает файл .ics для календаря — всё работает, но вручную. */
  endpoint: '',

  /* ---- 2. Кто вы ---------------------------------------------------------- */
  photographer: {
    name: 'Elena Bjelobrković Photography',
    studio: 'Bar, Crna Gora',
    phone: '',                 // например '+382 6X XXX XXX'
    email: '',                 // показывается клиенту; пустое — не показывается
    instagram: ''              // например 'https://instagram.com/...'
  },

  /* ---- 3. Рабочее время студии --------------------------------------------
     days: 0 — воскресенье, 1 — понедельник … 6 — суббота.
     stepMin — с каким шагом предлагать начало съёмки. */
  schedule: { days: [1, 2, 3, 4, 5], start: '10:00', end: '14:00', stepMin: 30 },

  bufferMin: 15,        // технический перерыв между двумя съёмками
  bookAheadDays: 90,    // на сколько дней вперёд можно записаться
  minNoticeHours: 24,   // за сколько часов минимум можно записаться
  currency: '€',

  /* ---- 4. Виды съёмок и пакеты --------------------------------------------
     price: число — цена; '' (пустая строка) — цена не показывается.
     priceFrom: true — цена выводится как «od 100 €».
     durationMin — сколько времени занимает съёмка (влияет на свободные часы).
     schedule у вида съёмки перебивает общее расписание из пункта 3. */
  sessionTypes: [
    {
      id: 'newborn',
      name: 'Newborn fotografisanje',
      subtitle: 'U studiju · 5 dana – 1 mjesec',
      description:
        'Sesija namijenjena bebama uzrasta od 5 dana do 1 mjesec. Fokus je na bebi — sitnim detaljima, ' +
        'nježnim crtama lica i tihim, prvim zajedničkim trenucima sa roditeljima. Sve se odvija bez žurbe ' +
        'i pritiska, uz dovoljno vremena za hranjenje, mažanje i umirivanje bebe.',
      notes: [
        'Rezervacije su moguće od 25. sedmice trudnoće — vaša beba se dodaje na baby listu.',
        'Mame koje su imale trudničko fotografisanje ostvaruju 10% popusta na odabrani newborn paket.'
      ],
      extras: 'Dodatne opcije: profesionalna izrada fotobook-a i izrada fotografija visoko kvalitetne štampe ' +
        '(dogovaraju se individualno nakon odabira fotografija).',
      packages: [
        {
          id: 'baby-start',
          name: 'Baby Start',
          price: 150,
          durationMin: 120,
          summary: 'Beba + roditelji | Fotografisanje do 2 sata | 20 digitalnih fotografija',
          includes: [
            '1 stilizovan set (beba sama, porodični portreti, klasične poze i rekviziti)',
            '20 profesionalno obrađenih fotografija u visokoj rezoluciji'
          ]
        },
        {
          id: 'precious-baby',
          name: 'Precious Baby',
          price: 200,
          durationMin: 180,
          summary: 'Beba + roditelji | Fotografisanje do 3 sata | 30 digitalnih fotografija',
          includes: [
            '3 pažljivo stilizovana seta (beba sama, porodični portreti, klasične poze i rekviziti)',
            '30 profesionalno obrađenih fotografija u visokoj rezoluciji'
          ]
        },
        {
          id: 'baby-premium',
          name: 'Baby Premium',
          price: 250,
          durationMin: 240,
          summary: 'Beba + roditelji | Fotografisanje do 4 sata | 50 digitalnih fotografija',
          includes: [
            '4 pažljivo stilizovana seta (beba sama, porodični portreti, klasične poze i rekviziti)',
            '50 profesionalno obrađenih fotografija u visokoj rezoluciji'
          ]
        }
      ]
    },

    {
      id: 'trudnice',
      name: 'Fotografisanje trudnica',
      subtitle: 'U studiju ili u prirodi',
      description:
        'Sesija posvećena budućim mamama, osmišljena tako da prikaže ljepotu trudnoće na prirodan, elegantan ' +
        'i emotivan način. Pravimo kombinaciju portreta i lifestyle kadrova — nježnih, spontanih i bez ' +
        'forsiranog poziranja.',
      notes: [
        'Rezervacije su moguće od 25. sedmice trudnoće.',
        'BONUS: mame koje su imale trudničko fotografisanje ostvaruju 10% popusta na odabrani newborn paket.'
      ],
      packages: [
        {
          id: 'mama-start',
          name: 'Mama Start',
          price: 80,
          durationMin: 60,
          summary: 'Buduća mama | Fotografisanje do 45–60 min | 15 digitalnih fotografija',
          includes: ['1 stilizovan set', 'Fokus na prirodne portrete', '15 profesionalno obrađenih fotografija']
        },
        {
          id: 'mama-basic',
          name: 'Mama Basic',
          price: 100,
          durationMin: 60,
          summary: 'Buduća mama + partner/starija djeca | Fotografisanje do 45–60 min | 30 digitalnih fotografija',
          includes: ['2 stilizovana seta', 'Fokus na prirodne portrete', '30 profesionalno obrađenih fotografija']
        },
        {
          id: 'mama-premium',
          name: 'Mama Premium',
          price: 150,
          durationMin: 60,
          summary: 'Buduća mama + partner/starija djeca | Fotografisanje do 45–60 min | 50 digitalnih fotografija',
          includes: ['3 stilizovana seta', 'Fokus na prirodne portrete', '50 profesionalno obrađenih fotografija']
        }
      ]
    },

    {
      id: 'bebe',
      name: 'Bebe do godine dana',
      subtitle: 'U studiju · 1–12 mjeseci',
      description:
        'Fotosesije namijenjene bebama uzrasta od 1 mjeseca do 1 godine, osmišljene tako da sačuvaju one važne ' +
        'faze prvih promjena u životu vaše bebe — od prvih osmijeha i pogleda, pa sve do prvih sjedenja ' +
        'i samostalnog otkrivanja svijeta.',
      packages: [
        {
          id: 'prva-godina',
          name: 'Prva godina života',
          price: 400,
          durationMin: 60,
          summary: 'Pet fotosesija tokom prve godine djeteta | 150 digitalnih fotografija',
          includes: [
            '5 fotosesija: u 1, 3, 6 i 9 mjeseci (po 20 fotografija) i fotosesija za prvi rođendan u 12 mjeseci (70 fotografija)',
            'Individualna tematska postavka (za složenije zahtjeve dogovor najmanje 1,5 mjeseca unaprijed)',
            'Cake Smash finale: svečano fotografisanje sa tortom u 12 mjeseci',
            'Mliječna kupka: nježna završna sesija nakon cake smash-a'
          ],
          notes: [
            'Pojedinačno bi sve sesije koštale 600 € — u paketu 400 €, ušteda 200 €.',
            'Plaćanje na rate je moguće uz prvu uplatu od 200 €, ostatak najkasnije do 6. mjeseca.',
            'Zakazivanjem birate termin prve sesije — ostale dogovaramo u toku godine.'
          ]
        },
        {
          id: 'baby-mini',
          name: 'Baby+ Mini',
          price: 80,
          durationMin: 60,
          summary: 'Beba + roditelji | Fotografisanje do 45–60 min | 20 digitalnih fotografija',
          includes: [
            '1 stilizovan set (beba i porodični portreti)',
            '20 profesionalno obrađenih fotografija u visokoj rezoluciji'
          ]
        },
        {
          id: 'baby-story',
          name: 'Baby+ Story',
          price: 100,
          durationMin: 60,
          summary: 'Beba + roditelji | Fotografisanje do 45–60 min | 30 digitalnih fotografija',
          includes: [
            '2 stilizovana seta (beba sama i porodični portreti)',
            '30 profesionalno obrađenih fotografija u visokoj rezoluciji'
          ]
        },
        {
          id: 'baby-plus-premium',
          name: 'Baby+ Premium',
          price: 250,
          durationMin: 60,
          summary: 'Beba + roditelji | Fotografisanje do 60 min | 50 digitalnih fotografija',
          includes: [
            '4 stilizovana seta (beba sama, porodični portreti, klasične poze i rekviziti)',
            '50 profesionalno obrađenih fotografija u visokoj rezoluciji'
          ]
        }
      ],
      extras: 'Dodatne opcije: profesionalna izrada fotobook-a i izrada fotografija visoko kvalitetne štampe ' +
        '(dogovaraju se individualno nakon odabira fotografija).'
    },

    {
      id: 'prvi-rodjendan',
      name: 'Prvi rođendan',
      subtitle: 'U studiju · cake smash i milky bath',
      description:
        'Fotografisanje posvećeno prvom rođendanu vaše bebe, uz pažljivo odabran rekvizit i dekoraciju. ' +
        'Idealno za one koji žele nježne i prirodne uspomene sa prvog rođendana.',
      notes: [
        'Ako želite da fotografije budu spremne prije rođendana, javite prilikom zakazivanja termina.'
      ],
      packages: [
        {
          id: 'rodjendan-basic',
          name: 'Basic',
          price: 80,
          durationMin: 60,
          summary: 'Fotografisanje u trajanju od 1 sat | 20 digitalnih fotografija',
          includes: [
            'Fotografisanje u dekorisanom studiju',
            'Tematska postavka (za složenije zahtjeve zakazivanje najmanje 1,5 mjeseca unaprijed)',
            '20 profesionalno obrađenih fotografija bebe + fotografije sa roditeljima'
          ]
        },
        {
          id: 'cake-smash',
          name: 'Basic + Cake Smash',
          price: 100,
          durationMin: 60,
          summary: 'Fotografisanje u trajanju od 1 sat | 40 digitalnih fotografija',
          includes: [
            'Fotografisanje u dekorisanom studiju',
            'Fotografisanje bebe dok uživa u rušenju torte',
            'Tematska postavka (za složenije zahtjeve zakazivanje najmanje 1,5 mjeseca unaprijed)',
            '40 profesionalno obrađenih fotografija bebe + fotografije sa roditeljima'
          ],
          notes: ['Torta nije uključena u paket.']
        },
        {
          id: 'milky-bath',
          name: 'Basic + Cake Smash + Milky Bath',
          price: 200,
          durationMin: 90,
          summary: 'Fotografisanje sa tortom i mliječnom kupkom | 70 digitalnih fotografija',
          includes: [
            'Fotografisanje u dekorisanom studiju',
            'Fotografisanje bebe dok uživa u rušenju torte',
            'Fotografisanje bebe u mliječnoj kupki nakon cake smash-a',
            'Torta je uključena u paket',
            'Tematska postavka (za individualnu postavku zakazivanje najmanje 2 mjeseca unaprijed)',
            '70 profesionalno obrađenih fotografija bebe + fotografije sa roditeljima'
          ],
          notes: ['Obavezno prijaviti alergije ili posebne prehrambene zahtjeve prije zakazivanja.']
        }
      ]
    },

    {
      id: 'djeca',
      name: 'Fotosesija djece',
      subtitle: 'U studiju · od 2 godine',
      description:
        'Sesije za djecu stariju od godinu dana: od prvih nesigurnih koraka do školskog uzrasta. Pravimo ' +
        'opuštene studijske fotosesije — svakodnevne portrete, umjetničke portrete, tematske setove ili ' +
        'obilježavanje rođendana. Ne forsiramo pozu i ne žurimo.',
      packages: [
        {
          id: 'djeca-mini',
          name: 'Mini',
          price: 80,
          durationMin: 60,
          summary: 'Fotografisanje do 45–60 min | 20 digitalnih fotografija',
          includes: [
            'Fotografisanje u dekorisanom studiju',
            '1 tematska postavka (za složenije zahtjeve zakazivanje najmanje 1,5 mjeseca unaprijed)',
            '20 profesionalno obrađenih fotografija djeteta + fotografije sa roditeljima'
          ],
          notes: ['Torta nije uključena u paket.']
        },
        {
          id: 'djeca-basic',
          name: 'Basic',
          price: 100,
          durationMin: 60,
          summary: 'Fotografisanje do 45–60 min | 30 digitalnih fotografija',
          includes: [
            'Fotografisanje u dekorisanom studiju',
            '2 tematske postavke (za složenije zahtjeve zakazivanje najmanje 1,5 mjeseca unaprijed)',
            '30 profesionalno obrađenih fotografija djeteta + fotografije sa roditeljima'
          ],
          notes: ['Torta nije uključena u paket.']
        },
        {
          id: 'djeca-premium',
          name: 'Premium',
          price: 250,
          durationMin: 60,
          summary: 'Fotografisanje do 45–60 min | 70 digitalnih fotografija',
          includes: [
            'Fotografisanje u dekorisanom studiju',
            '3 tematske postavke (za složenije zahtjeve zakazivanje najmanje 1,5 mjeseca unaprijed)',
            '70 profesionalno obrađenih fotografija djeteta + fotografije sa roditeljima'
          ],
          notes: ['Torta je uključena u paket.']
        }
      ]
    },

    {
      id: 'porodicno',
      name: 'Porodično fotografisanje',
      subtitle: 'U studiju ili u prirodi',
      description:
        'Porodični portreti — topli, opušteni i bez forsiranog poziranja.',
      packages: [
        {
          id: 'porodicno-dogovor',
          name: 'Po dogovoru',
          price: '',
          durationMin: 60,
          summary: 'Detalje i cijenu dogovaramo lično nakon prijave',
          includes: []
        }
      ]
    },

    {
      id: 'proslave',
      name: 'Fotografisanje proslava',
      subtitle: 'Na lokaciji · do ~50 gostiju',
      description:
        'Fotografisanje rođendana, proslava i drugih porodičnih događaja realizuje se u dokumentarnom stilu, ' +
        'sa fokusom na atmosferu, emocije i spontane trenutke. U toku proslave izdvajamo i kratko vrijeme ' +
        'za porodične fotografije.',
      // Događaji nisu vezani za studijsko radno vrijeme:
      schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '09:00', end: '21:00', stepMin: 60 },
      notes: [
        'Prva dva sata fotografisanja se naplaćuju po cijeni od 100 € po satu, svaki naredni sat — 50 €.',
        'Za duže proslave moguće je unaprijed dogovoriti fiksnu cijenu, u zavisnosti od trajanja i obima događaja.',
        'Za lokacije van opštine Bar dodatno se naplaćuju troškovi prevoza.'
      ],
      packages: [
        {
          id: 'manje-proslave',
          name: 'Manje proslave',
          price: 100,
          priceFrom: true,
          durationMin: 120,
          summary: 'Osnovni termin od 2 sata | 100+ fotografija u visokoj rezoluciji',
          includes: [
            'Fotografisanje događaja',
            'Fotografisanje sa najbližima',
            'Porodične fotografije',
            '100+ fotografija u visokoj rezoluciji'
          ]
        }
      ]
    },

    {
      id: 'krstenje',
      name: 'Fotografisanje krštenja',
      subtitle: 'Na lokaciji',
      description:
        'Fotografisanje krštenja obuhvata dokumentovanje cijelog događaja na prirodan i nenametljiv način: ' +
        'od priprema, preko ceremonije u crkvi, pa do porodičnih trenutaka nakon obreda.',
      schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '09:00', end: '21:00', stepMin: 60 },
      notes: ['Za lokacije van opštine Bar dodatno se naplaćuju troškovi prevoza.'],
      packages: [
        {
          id: 'krstenje-paket',
          name: 'Fotografisanje krštenja',
          price: 100,
          durationMin: 120,
          summary: 'Ceremonija i porodične fotografije | 100+ fotografija u visokoj rezoluciji',
          includes: [
            'Fotografisanje ceremonije',
            'Fotografisanje sa najbližima',
            'Porodične fotografije',
            '100+ fotografija u visokoj rezoluciji'
          ]
        }
      ]
    }
  ]
};
