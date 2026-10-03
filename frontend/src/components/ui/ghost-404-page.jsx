import { AnimatePresence, motion } from 'framer-motion';
import { Ghost, Home, RotateCcw } from 'lucide-react';

const ghostImage = 'https://cdn.21st.dev/assets/mirror/88/8848c4fd858052c49c5a5d7267489c02b021c6cf3e31bfec02787e16f1ab7d0e.png';

const containerVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.43, 0.13, 0.23, 0.96], staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.43, 0.13, 0.23, 0.96] } },
};

const numberVariants = {
  hidden: (direction) => ({ opacity: 0, x: direction * 28, y: 12, rotate: direction * 4 }),
  visible: {
    opacity: 0.72,
    x: 0,
    y: 0,
    rotate: 0,
    transition: { duration: 0.65, ease: [0.43, 0.13, 0.23, 0.96] },
  },
};

const ghostVariants = {
  hidden: { scale: 0.82, opacity: 0, y: 12, rotate: -5 },
  visible: { scale: 1, opacity: 1, y: 0, rotate: 0, transition: { duration: 0.55 } },
  hover: {
    scale: 1.08,
    y: -8,
    rotate: [0, -4, 4, -4, 0],
    transition: { duration: 0.8, ease: 'easeInOut', rotate: { duration: 1.8, repeat: Infinity, repeatType: 'reverse' } },
  },
  floating: { y: [-4, 4], transition: { duration: 2, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' } },
};

export default function ErrorPage({ status = 404, onHome, onRetry }) {
  const isMethodError = status === 405;
  const title = isMethodError ? 'Aksi tidak tersedia' : 'Halaman tidak ditemukan';
  const description = isMethodError
    ? 'Halaman ini tidak dapat digunakan untuk peran atau aksi yang sedang dipilih.'
    : 'Halaman yang kamu cari mungkin sudah dipindahkan atau tidak pernah tersedia.';

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-10 bg-slate-50">
      <AnimatePresence mode="wait">
        <motion.section
          className="w-full max-w-2xl text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          aria-labelledby="error-page-title"
        >
          <motion.div variants={itemVariants} className="flex items-center justify-center gap-3 sm:gap-6 mb-7 sm:mb-9">
            <motion.span
              className="text-[76px] sm:text-[120px] leading-none font-black tracking-tight text-slate-900/70 select-none"
              variants={numberVariants}
              custom={-1}
            >
              {String(status).charAt(0)}
            </motion.span>

            <motion.div
              className="relative h-20 w-20 sm:h-28 sm:w-28 shrink-0"
              variants={ghostVariants}
              animate={["visible", "floating"]}
              whileHover="hover"
            >
              <img
                src={ghostImage}
                alt=""
                width="120"
                height="120"
                className="h-full w-full object-contain select-none"
                draggable="false"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                  event.currentTarget.nextElementSibling.hidden = false;
                }}
              />
              <Ghost className="hidden h-full w-full text-slate-700/70" aria-hidden="true" />
            </motion.div>

            <motion.span
              className="text-[76px] sm:text-[120px] leading-none font-black tracking-tight text-slate-900/70 select-none"
              variants={numberVariants}
              custom={1}
            >
              {String(status).charAt(2)}
            </motion.span>
          </motion.div>

          <motion.h1 id="error-page-title" variants={itemVariants} className="text-2xl sm:text-4xl font-bold text-slate-900 mb-3">
            {title}
          </motion.h1>
          <motion.p variants={itemVariants} className="mx-auto max-w-lg text-sm sm:text-base text-slate-500 mb-7 sm:mb-9">
            {description}
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onHome}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Ke dashboard
            </button>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Coba lagi
              </button>
            )}
          </motion.div>
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
