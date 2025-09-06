$(function () {
    var $win = $(window);
    var $header = $("header"); // 프로젝트 헤더 선택자에 맞춰 조정
    var $menu = $(".menu"); // 오버레이/사이드 메뉴 래퍼
    var $btnMenuOpen = $(".btn_menu");
    var $btnMenuClose = $(".btn_menu_close");

    var lastScrollTop = 0;
    var delta = 5; // 미세 스크롤 무시 임계값(px)
    var lock = false; // rAF 쓰는 간단한 쓰로틀

    // ===== 헤더 보이기/숨기기 =====
    function hideHeader() {
        if (!$header.hasClass("is-hidden")) {
            $header.addClass("is-hidden");
        }
    }
    function showHeader() {
        if ($header.hasClass("is-hidden")) {
            $header.removeClass("is-hidden");
        }
    }

    // 스크롤 핸들러 (방향 감지)
    function onScroll() {
        var st = $win.scrollTop();

        // 작은 움직임 무시
        if (Math.abs(st - lastScrollTop) <= delta) {
            lock = false;
            return;
        }

        if (st > lastScrollTop && st > 50) {
            // 스크롤 다운: 헤더 페이드 아웃 + 위로 숨김
            hideHeader();
        } else {
            // 스크롤 업: 헤더 페이드 인 + 원위치
            showHeader();
        }

        lastScrollTop = st <= 0 ? 0 : st; // 음수 방지(iOS bounce)
        lock = false;
    }

    // 성능을 위한 rAF 쓰로틀
    $win.on("scroll", function () {
        if (lock) return;
        lock = true;
        requestAnimationFrame(onScroll);
    });

    // 페이지 맨 위에선 무조건 보이도록
    $win.on("scroll", function () {
        if ($win.scrollTop() <= 0) showHeader();
    });

    // ===== 메뉴 열기/닫기 =====
    function openMenu() {
        $menu.stop(true, true).css("display", "flex").hide().fadeIn(200);
        $("body").addClass("no-scroll");
        // 접근성: 필요시 aria
        $menu.attr("aria-hidden", "false");
    }
    function closeMenu() {
        $menu.stop(true, true).fadeOut(200, function () {
            $("body").removeClass("no-scroll");
        });
        $menu.attr("aria-hidden", "true");
    }

    $btnMenuOpen.on("click", openMenu);
    $btnMenuClose.on("click", closeMenu);

    // 오버레이 클릭으로 닫기 (오버레이가 .menu 자체라면 내부 컨텐츠 래퍼에 .menu__panel 주고 분기)
    $menu.on("click", function (e) {
        // 패널 영역 클릭은 유지, 바깥(오버레이) 클릭만 닫기
        if ($(e.target).closest(".menu__panel").length === 0) {
            closeMenu();
        }
    });

    // ESC 키로 닫기
    $(document).on("keyup", function (e) {
        if (e.key === "Escape") closeMenu();
    });
});

// ===== 로고 클릭 시 localStorage 초기화 =====
$("header h1 a").on("click", function (e) {
    // fullpage 관련 저장값 제거
    localStorage.removeItem("dau:fullpage:lastIndex");
    localStorage.removeItem("dau:subvisual:lastIndex");
});

// common.js 하단에 추가 (기존 코드 유지)
$(document).on("dau:header:hide", function () {
    // 프로젝트의 hideHeader 함수가 동일 스코프에 있으므로 그대로 호출
    // (또는 $header.addClass('is-hidden'))
    if (typeof hideHeader === "function") hideHeader();
    else $("header").addClass("is-hidden");
});

$(document).on("dau:header:show", function () {
    if (typeof showHeader === "function") showHeader();
    else $("header").removeClass("is-hidden");
});

// (선택) 디버깅: stack 값 확인하고 싶을 때
$(document).on("dau:fullpageScroll", function (e, p) {
    // console.log("[bridge]", p && p.stack, p && p.prevStack);
});
