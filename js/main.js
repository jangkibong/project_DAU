// main.js
// -----------------------------------------------------
// 0) 인트로 처리
// -----------------------------------------------------
$(function () {
    setTimeout(function () {
        $(".intro").removeClass("intro");
    }, 200);
});

(function () {
    document.addEventListener("DOMContentLoaded", init);

    function init() {
        const fullpage = document.querySelector("#fullpage");
        if (!fullpage) return;

        const track = fullpage.querySelector(".fullpage_track");
        const sections = Array.from(fullpage.querySelectorAll(".fp_section"));
        if (!track || sections.length === 0) return;

        // ===== 유틸 =====
        const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
        const scrollY = () => window.pageYOffset;
        const docH = () =>
            Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        const maxScroll = () => Math.max(0, docH() - window.innerHeight);

        // -----------------------------------------------------
        // A) 글로벌 스무스 스크롤러 (관성 스크롤) — #fullpage 캡처 바깥에서만 사용
        // -----------------------------------------------------
        const Smooth = (() => {
            let target = scrollY();
            let current = target;
            let raf = null;
            const ease = 0.12; // 0.08~0.2
            const minStep = 0.1;

            function loop() {
                const diff = target - current;
                if (Math.abs(diff) < minStep) {
                    current = target;
                    window.scrollTo(0, Math.round(current));
                    raf = null;
                    return;
                }
                current += diff * ease;
                window.scrollTo(0, Math.round(current));
                raf = requestAnimationFrame(loop);
            }

            return {
                add(deltaY) {
                    target = clamp(target + deltaY, 0, maxScroll());
                    if (!raf) raf = requestAnimationFrame(loop);
                },
                jumpTo(y) {
                    target = clamp(y, 0, maxScroll());
                    current = target;
                    window.scrollTo(0, Math.round(current));
                },
                resize() {
                    target = clamp(target, 0, maxScroll());
                    current = clamp(current, 0, maxScroll());
                },
            };
        })();

        // -----------------------------------------------------
        // B) #fullpage 상태/유틸
        // -----------------------------------------------------
        let currentIndex = 0;
        let stack = 0;
        let prevStack = 0;
        let animating = false; // #fullpage 섹션 전환 중
        let vh = window.innerHeight;
        let touchStartY = 0;

        const TRANSITION_MS = 700;
        const TRANSITION_BUFFER = 50;
        const TOL = 1;
        const TTL_MS = 60 * 60 * 1000; // fullpage 1h
        const LS_KEY = "dau:fullpage:lastIndex";

        const viewportBottom = () => scrollY() + window.innerHeight;
        const fullTop = () => fullpage.getBoundingClientRect().top + scrollY();
        const fullBottom = () => fullTop() + fullpage.offsetHeight;
        const isAtFullpageBottom = () => Math.abs(fullBottom() - viewportBottom()) <= TOL;

        function applyTransform() {
            track.style.transform = `translate3d(0, ${-currentIndex * vh}px, 0)`;
        }
        function applyTransformImmediate() {
            const prev = track.style.transition;
            track.style.transition = "none";
            // reflow
            // eslint-disable-next-line no-unused-expressions
            track.offsetHeight;
            applyTransform();
            requestAnimationFrame(() => {
                track.style.transition = prev || "";
            });
        }

        // sub_visual 스와이프 잠금/해제
        function setSubTouchEnabled(enabled) {
            if (!subSwiper) return;
            subSwiper.allowTouchMove = !!enabled;
            subSwiper.allowSlideNext = !!enabled;
            subSwiper.allowSlidePrev = !!enabled;
        }

        function snapTo(index) {
            animating = true;
            fullpage.classList.add("is-animating");
            setSubTouchEnabled(false); // fullpage 전환 중 sub 잠금

            currentIndex = clamp(index, 0, sections.length - 1);
            applyTransform();
            saveLastIndex(currentIndex);

            setTimeout(() => {
                animating = false;
                fullpage.classList.remove("is-animating");
                setSubTouchEnabled(true); // 전환 종료 시 해제
            }, TRANSITION_MS + TRANSITION_BUFFER);
        }

        function saveLastIndex(idx) {
            try {
                localStorage.setItem(
                    LS_KEY,
                    JSON.stringify({ idx: clamp(idx, 0, sections.length - 1), ts: Date.now() })
                );
            } catch (_) {}
        }
        function loadLastIndex() {
            try {
                const raw = localStorage.getItem(LS_KEY);
                if (!raw) return 0;
                const obj = JSON.parse(raw);
                if (!obj || typeof obj.idx !== "number" || typeof obj.ts !== "number") return 0;
                if (Date.now() - obj.ts > TTL_MS) return 0;
                return clamp(obj.idx, 0, sections.length - 1);
            } catch (_) {
                return 0;
            }
        }

        // 헤더 토글 브릿지
        function emitHeaderByStackChange(newStack, oldStack) {
            if (newStack > oldStack) $(document).trigger("dau:header:hide");
            else if (newStack < oldStack) $(document).trigger("dau:header:show");
        }

        // -----------------------------------------------------
        // C) sub_visual (세로 슬라이드 + 고정 텍스트 페이드) + LS 저장/복원
        // -----------------------------------------------------
        const SUB_LS_KEY = "dau:subvisual:lastIndex";
        const SUB_TTL_MS = 60 * 60 * 1000; // 1h

        function saveSubIndex(idx, total) {
            try {
                const last = Math.max(0, Math.min(idx, total - 1));
                localStorage.setItem(SUB_LS_KEY, JSON.stringify({ idx: last, ts: Date.now() }));
            } catch (_) {}
        }
        function loadSubIndex(total) {
            try {
                const raw = localStorage.getItem(SUB_LS_KEY);
                if (!raw) return 0;
                const obj = JSON.parse(raw);
                if (!obj || typeof obj.idx !== "number" || typeof obj.ts !== "number") return 0;
                if (Date.now() - obj.ts > SUB_TTL_MS) return 0;
                return Math.max(0, Math.min(obj.idx, total - 1));
            } catch (_) {
                return 0;
            }
        }

        const subVisual = document.querySelector(".sub_visual");
        const subTitlesWrap = subVisual?.querySelector(".sub_titles_wrap");
        const subContent = subVisual?.querySelector(".sub_visual_content");

        let subSwiper = null;
        let subIndex = -1;
        let subLocalStack = 0;
        let subCooldown = false;
        let subAnimating = false;

        const subCooldownMS = 300;
        const subThreshold = () => Math.max(140, Math.floor(window.innerHeight * 0.3));

        if (subVisual && subContent) {
            // content → Swiper 래핑
            const items = Array.from(subContent.querySelectorAll(".sub_visual_item"));
            if (items.length) {
                subContent.classList.add("swiper");
                const wrapper = document.createElement("div");
                wrapper.className = "swiper-wrapper";
                items.forEach((item) => {
                    const slide = document.createElement("div");
                    slide.className = "swiper-slide";
                    slide.appendChild(item);
                    wrapper.appendChild(slide);
                });
                while (subContent.firstChild) subContent.removeChild(subContent.firstChild);
                subContent.appendChild(wrapper);
            }

            // 고정 텍스트(.sub_tilte_wrap 전체 페이드)
            const fixedBlocks = subTitlesWrap
                ? Array.from(subTitlesWrap.querySelectorAll(".sub_tilte_wrap"))
                : [];
            function activateFixedBlock(i) {
                fixedBlocks.forEach((el, idx) => {
                    const on = idx === i;
                    el.classList.toggle("is-active", on);
                    el.setAttribute("aria-hidden", on ? "false" : "true");
                });
            }

            subSwiper = new Swiper(subContent, {
                direction: "vertical",
                effect: "slide",
                speed: 700,
                loop: false,
                allowTouchMove: true,
                simulateTouch: true,
                on: {
                    init() {
                        const total = this.slides.length;
                        const restored = loadSubIndex(total);
                        if (restored > 0) {
                            this.slideTo(restored, 0);
                            activateFixedBlock(restored);
                        } else {
                            const i = this.realIndex ?? this.activeIndex ?? 0;
                            activateFixedBlock(i);
                        }
                    },
                    slideChange() {
                        const i = this.realIndex ?? this.activeIndex ?? 0;
                        activateFixedBlock(i);
                        saveSubIndex(i, this.slides.length);
                    },
                    slideChangeTransitionStart() {
                        subAnimating = true;
                    },
                    transitionStart() {
                        subAnimating = true;
                    },
                    slideChangeTransitionEnd() {
                        subAnimating = false;
                    },
                    transitionEnd() {
                        subAnimating = false;
                    },
                },
            });

            subIndex = sections.findIndex((sec) => sec.contains(subVisual));
        }

        // -----------------------------------------------------
        // D) 델타 라우팅 (sub에서 소비 → 남은 델타만 fullpage)
        // -----------------------------------------------------
        function accumulateSub(deltaY) {
            if (!subSwiper || subCooldown) return;
            subLocalStack += deltaY;

            if (Math.abs(subLocalStack) >= subThreshold()) {
                const goingDown = subLocalStack > 0;
                const i = subSwiper.realIndex ?? subSwiper.activeIndex ?? 0;
                const last = subSwiper.slides.length - 1;

                if (goingDown && i < last) subSwiper.slideNext();
                else if (!goingDown && i > 0) subSwiper.slidePrev();

                subLocalStack = 0;
                subCooldown = true;
                setTimeout(() => {
                    subCooldown = false;
                }, subCooldownMS);
            }
        }

        // sub 섹션일 때: sub가 델타를 소비하고, 엣지(첫/마지막) 상태에서만 남은 델타를 fullpage로 보냄
        function routeDelta(deltaY) {
            if (currentIndex !== subIndex || !subSwiper) {
                return { consumed: 0, remain: deltaY };
            }

            const i = subSwiper.realIndex ?? subSwiper.activeIndex ?? 0;
            const last = subSwiper.slides.length - 1;
            const goingDown = deltaY > 0;

            // sub 슬라이드 애니메이션 중 → 전량 소비
            if (subAnimating) {
                accumulateSub(deltaY);
                return { consumed: deltaY, remain: 0 };
            }

            // 가장자리 도달 전 → 전량 소비
            if ((goingDown && i < last) || (!goingDown && i > 0)) {
                accumulateSub(deltaY);
                return { consumed: deltaY, remain: 0 };
            }

            // 이미 가장자리(첫/마지막) → 남은 델타를 fullpage로
            return { consumed: 0, remain: deltaY };
        }

        // -----------------------------------------------------
        // E) #fullpage 누적/스냅
        // -----------------------------------------------------
        function accumulate(deltaY) {
            // 안전: sub/ fullpage 애니메 중이면 무시
            if ((currentIndex === subIndex && subAnimating) || animating) return;

            const old = stack;
            stack += deltaY;

            console.log("[fullpage stack]", Math.trunc(stack));
            $(document).trigger("dau:fullpageScroll", { deltaY, stack, prevStack: old });
            emitHeaderByStackChange(stack, old);

            if (Math.abs(stack) >= vh) {
                const goingDown = stack > 0;

                // 마지막 섹션에서 아래 → 자유 스크롤 (스무스 스크롤러에 위임)
                if (goingDown && currentIndex === sections.length - 1) {
                    Smooth.add(deltaY);
                    stack = 0;
                    prevStack = 0;
                    return;
                }

                const nextIdx = currentIndex + (goingDown ? 1 : -1);
                if (nextIdx >= 0 && nextIdx < sections.length) snapTo(nextIdx);
                stack = 0;
                prevStack = 0;
            } else {
                prevStack = stack;
            }
        }

        // -----------------------------------------------------
        // F) 캡처 게이트 & 탈출 룩어헤드
        // -----------------------------------------------------
        function shouldCapture() {
            if (animating) return true;
            return isAtFullpageBottom();
        }
        function lookaheadExitToNormal(deltaY) {
            if (!isAtFullpageBottom()) return false;
            const willStack = stack + deltaY;
            if (currentIndex === sections.length - 1 && deltaY > 0 && Math.abs(willStack) >= vh) {
                Smooth.add(deltaY);
                stack = 0;
                prevStack = 0;
                return true;
            }
            return false;
        }

        // -----------------------------------------------------
        // G) 입력 핸들러 (휠/터치)
        // -----------------------------------------------------
        function onWheel(e) {
            const deltaY = e.deltaY;

            // fullpage 전환 중 완전 차단
            if (animating) {
                e.preventDefault();
                return;
            }

            // 캡처 바깥 → 부드러운 전역 스크롤
            if (!shouldCapture()) {
                e.preventDefault();
                Smooth.add(deltaY);
                return;
            }

            // 마지막 섹션 탈출은 스무스 처리
            if (lookaheadExitToNormal(deltaY)) {
                e.preventDefault();
                return;
            }

            // sub → 라우팅
            const { consumed, remain } = routeDelta(deltaY);
            if (consumed !== 0) e.preventDefault();
            if (remain === 0) return;

            // fullpage 누적
            e.preventDefault();
            accumulate(remain);
        }

        function onTouchStart(e) {
            if (e.touches && e.touches.length > 0) touchStartY = e.touches[0].clientY;
        }
        function onTouchMove(e) {
            if (!e.touches || e.touches.length === 0) return;
            const currentY = e.touches[0].clientY;
            const deltaY = touchStartY - currentY; // 양수=아래

            if (animating) {
                e.preventDefault();
                return;
            }

            if (!shouldCapture()) {
                e.preventDefault();
                Smooth.add(deltaY);
                return;
            }

            if (lookaheadExitToNormal(deltaY)) {
                e.preventDefault();
                return;
            }

            const { consumed, remain } = routeDelta(deltaY);
            if (consumed !== 0) e.preventDefault();
            if (remain === 0) return;

            e.preventDefault();
            accumulate(remain);
        }

        function onResize() {
            vh = window.innerHeight;
            applyTransform();
            Smooth.resize(); // 문서 높이 변화 반영
        }

        // 초기 복원
        currentIndex = loadLastIndex();
        applyTransformImmediate();

        // 바인딩
        window.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("touchstart", onTouchStart, { passive: true });
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("resize", onResize);

        // -----------------------------------------------------
        // H) PROJECT 가로 스와이퍼 (#project .swiper)
        //     - 터치/마우스 드래그, 인디케이터(불릿), 재생/정지 + 좌/우 버튼
        // -----------------------------------------------------
        (function initProjectSwiper() {
            const host = document.querySelector("#project");
            if (!host) return;

            if (host.__inited) return;
            host.__inited = true;

            // 기존 .swiper_item들을 .swiper-wrapper/.swiper-slide로 자동 래핑
            const items = Array.from(host.querySelectorAll(".swiper_item"));
            if (!items.length) return;

            const wrapper = document.createElement("div");
            wrapper.className = "swiper-wrapper";

            items.forEach((item) => {
                const slide = document.createElement("div");
                slide.className = "swiper-slide";
                slide.appendChild(item);
                wrapper.appendChild(slide);
            });

            while (host.firstChild) host.removeChild(host.firstChild);
            host.appendChild(wrapper);

            // 컨트롤 UI(불릿 + 재생/정지)
            const controls = document.createElement("div");
            controls.className = "project-controls";
            const pagination = document.createElement("div");
            pagination.className = "swiper-pagination";
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "swiper-play-toggle";
            toggle.setAttribute("aria-pressed", "true"); // true = 재생중
            toggle.setAttribute("aria-label", "Pause autoplay");
            toggle.textContent = "Pause";

            controls.appendChild(pagination);
            controls.appendChild(toggle);

            const wrap = host.closest(".swiper_wrap") || host.parentElement;
            (wrap || host).appendChild(controls);

            // ✅ 좌/우 네비게이션 버튼 생성 (Swiper 기본 클래스로 간편 적용)
            const prevBtn = document.createElement("div");
            prevBtn.className = "swiper-button-prev";
            prevBtn.setAttribute("aria-label", "Previous slide");

            const nextBtn = document.createElement("div");
            nextBtn.className = "swiper-button-next";
            nextBtn.setAttribute("aria-label", "Next slide");

            // 버튼은 보통 슬라이더 박스 위에 얹음
            (wrap || host).appendChild(prevBtn);
            (wrap || host).appendChild(nextBtn);

            // Swiper 초기화 (가로, 드래그, 불릿, 자동재생, 좌/우 버튼)
            const projectSwiper = new Swiper(host, {
                direction: "horizontal",
                slidesPerView: 1,
                spaceBetween: 24,
                loop: true,
                speed: 600,
                allowTouchMove: true,
                simulateTouch: true, // 마우스 드래그
                grabCursor: true,
                nested: true, // fullpage 내부 제스처 안정화
                touchAngle: 30,
                threshold: 8,
                pagination: {
                    el: pagination,
                    clickable: true,
                },
                navigation: {
                    // ✅ 추가된 내비게이션
                    nextEl: nextBtn,
                    prevEl: prevBtn,
                },
                autoplay: {
                    delay: 3500,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: true,
                },
            });

            // 재생/정지 토글
            function setPaused(paused) {
                if (paused) {
                    projectSwiper.autoplay.stop();
                    toggle.setAttribute("aria-pressed", "false");
                    toggle.setAttribute("aria-label", "Resume autoplay");
                    toggle.textContent = "Play";
                    toggle.classList.add("is-paused");
                } else {
                    projectSwiper.autoplay.start();
                    toggle.setAttribute("aria-pressed", "true");
                    toggle.setAttribute("aria-label", "Pause autoplay");
                    toggle.textContent = "Pause";
                    toggle.classList.remove("is-paused");
                }
            }
            toggle.addEventListener("click", () => {
                const isPlaying = toggle.getAttribute("aria-pressed") === "true";
                setPaused(isPlaying); // 재생중이면 pause, 멈춤이면 play
            });

            // 초기 상태: 재생중
            setPaused(false);
        })();
    }
})();
